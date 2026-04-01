from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import uuid, json

from database import get_db, ComplianceEvent, Outlet, Staff
from middleware.auth import require_roles
from services.redis_service import get_redis, publish_alert, subscribe_outlet

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────

class AcknowledgePayload(BaseModel):
    acknowledged_by: str


# ── REST endpoints ────────────────────────────────────────────────────────

@router.get("/outlet/{outlet_id}/events")
async def list_events(
    outlet_id: str,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    chef_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    query = select(ComplianceEvent).where(ComplianceEvent.outlet_id == outlet_id)

    if severity:
        query = query.where(ComplianceEvent.severity == severity)
    if event_type:
        query = query.where(ComplianceEvent.event_type == event_type)
    if chef_id:
        query = query.where(ComplianceEvent.chef_id == chef_id)
    if start_date:
        query = query.where(ComplianceEvent.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(ComplianceEvent.timestamp <= datetime.fromisoformat(end_date))

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.order_by(ComplianceEvent.timestamp.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    events = result.scalars().all()

    return {
        "data": events,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/outlet/{outlet_id}/score")
async def get_compliance_score(
    outlet_id: str,
    days: int = 1,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(ComplianceEvent).where(
            and_(
                ComplianceEvent.outlet_id == outlet_id,
                ComplianceEvent.timestamp >= since
            )
        )
    )
    events = result.scalars().all()

    if not events:
        return {"score": 100, "total_events": 0, "critical_breaches": 0}

    passes = sum(1 for e in events if e.event_type == "step_pass")
    total = len(events)
    critical = sum(1 for e in events if e.severity == "critical")

    base_score = (passes / total) * 100 if total > 0 else 100
    weighted = max(0, base_score - (critical * 5))

    # Per-chef breakdown
    chef_map: dict = {}
    for e in events:
        if e.chef_id not in chef_map:
            chef_map[e.chef_id] = {"name": e.chef_name, "pass": 0, "total": 0, "issues": {}}
        chef_map[e.chef_id]["total"] += 1
        if e.event_type == "step_pass":
            chef_map[e.chef_id]["pass"] += 1
        else:
            et = e.event_type
            chef_map[e.chef_id]["issues"][et] = chef_map[e.chef_id]["issues"].get(et, 0) + 1

    chef_scores = []
    for cid, cd in chef_map.items():
        cscore = (cd["pass"] / cd["total"] * 100) if cd["total"] > 0 else 100
        top_issue = max(cd["issues"], key=cd["issues"].get) if cd["issues"] else "none"
        chef_scores.append({
            "chef_id": cid,
            "chef_name": cd["name"],
            "score": round(cscore, 1),
            "top_issue": top_issue,
            "error_count": cd["total"] - cd["pass"],
        })

    return {
        "outlet_id": outlet_id,
        "date": datetime.utcnow().date().isoformat(),
        "score": round(weighted, 1),
        "total_steps_expected": total,
        "steps_passed": passes,
        "steps_failed": total - passes,
        "critical_breaches": critical,
        "chef_scores": sorted(chef_scores, key=lambda x: x["score"]),
    }


@router.patch("/{event_id}/acknowledge")
async def acknowledge_event(
    event_id: str,
    payload: AcknowledgePayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"]))
):
    await db.execute(
        update(ComplianceEvent)
        .where(ComplianceEvent.id == event_id)
        .values(
            is_acknowledged=True,
            acknowledged_by=payload.acknowledged_by,
            acknowledged_at=datetime.utcnow(),
        )
    )
    await db.commit()
    return {"status": "acknowledged"}


@router.post("/ingest")
async def ingest_event(
    event: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the edge device / vision pipeline to push compliance events.
    This endpoint accepts events from the RPi and cloud inference engine.
    """
    evt = ComplianceEvent(
        id=str(uuid.uuid4()),
        outlet_id=event["outlet_id"],
        chef_id=event.get("chef_id", "unknown"),
        chef_name=event.get("chef_name", "Unknown Chef"),
        dish_id=event.get("dish_id", ""),
        dish_name=event.get("dish_name", ""),
        sop_id=event.get("sop_id", ""),
        step_id=event.get("step_id"),
        step_name=event.get("step_name"),
        timestamp=datetime.utcnow(),
        source=event.get("source", "CCTV"),
        event_type=event["event_type"],
        severity=event["severity"],
        details=event.get("details", {}),
        video_clip_url=event.get("video_clip_url"),
    )
    db.add(evt)
    await db.commit()

    # Publish to Redis for real-time WebSocket delivery
    redis = await get_redis()
    alert_payload = {
        "id": evt.id,
        "outlet_id": evt.outlet_id,
        "chef_name": evt.chef_name,
        "event_type": evt.event_type,
        "severity": evt.severity,
        "step_name": evt.step_name,
        "dish_name": evt.dish_name,
        "timestamp": evt.timestamp.isoformat(),
        "details": evt.details,
    }
    await publish_alert(redis, evt.outlet_id, alert_payload)

    return {"status": "ingested", "event_id": evt.id}


# ── WebSocket endpoint ────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, outlet_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(outlet_id, []).append(ws)

    def disconnect(self, outlet_id: str, ws: WebSocket):
        if outlet_id in self.active:
            self.active[outlet_id].remove(ws)

    async def broadcast(self, outlet_id: str, message: dict):
        for ws in self.active.get(outlet_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


@router.websocket("/ws/alerts/{outlet_id}")
async def ws_alerts(outlet_id: str, websocket: WebSocket):
    await manager.connect(outlet_id, websocket)
    try:
        redis = await get_redis()
        async for message in subscribe_outlet(redis, outlet_id):
            await websocket.send_json(json.loads(message))
    except WebSocketDisconnect:
        manager.disconnect(outlet_id, websocket)
