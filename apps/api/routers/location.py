from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from pydantic import BaseModel
from typing import Optional, List
import uuid, base64

from database import (
    get_db, KitchenZone, ZoneOccupancyEvent, ZoneTransition,
    ZoneHeatmapSnapshot, LayoutRecommendation, Outlet
)
from middleware.auth import require_roles
from services.location_engine import run_recommendation_engine, compute_hourly_heatmap

router = APIRouter()


class ZoneCreate(BaseModel):
    camera_id: str
    name: str
    zone_type: str
    polygon_points: List[List[int]]
    is_hygiene_sensitive: bool = False
    max_occupancy: Optional[int] = None
    fssai_zone_class: Optional[str] = None


class ZoneTransitionCreate(BaseModel):
    chef_id: Optional[str] = None
    from_zone_id: str
    to_zone_id: str
    had_wash_basin_visit: bool = False
    is_hygiene_breach: bool = False


class RecommendationStatusUpdate(BaseModel):
    status: str  # open | in_progress | resolved | dismissed


# ── Zone management ───────────────────────────────────────────────────────

@router.get("/outlet/{outlet_id}/zones")
async def list_zones(
    outlet_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    result = await db.execute(
        select(KitchenZone).where(KitchenZone.outlet_id == outlet_id)
    )
    return result.scalars().all()


@router.post("/outlet/{outlet_id}/zones")
async def create_zone(
    outlet_id: str,
    payload: ZoneCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    zone = KitchenZone(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        **payload.model_dump(),
    )
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return zone


@router.delete("/zones/{zone_id}")
async def delete_zone(
    zone_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    result = await db.execute(select(KitchenZone).where(KitchenZone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(404, "Zone not found")
    await db.delete(zone)
    await db.commit()
    return {"deleted": zone_id}


# ── Heatmap ───────────────────────────────────────────────────────────────

@router.get("/outlet/{outlet_id}/heatmap")
async def get_heatmap(
    outlet_id: str,
    hours: int = 8,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    """Get latest heatmap snapshots aggregated."""
    from datetime import datetime, timedelta
    since = datetime.utcnow() - timedelta(hours=hours)

    snaps_result = await db.execute(
        select(ZoneHeatmapSnapshot).where(
            and_(
                ZoneHeatmapSnapshot.outlet_id == outlet_id,
                ZoneHeatmapSnapshot.snapshot_hour >= since,
            )
        ).order_by(ZoneHeatmapSnapshot.snapshot_hour.desc())
    )
    snapshots = snaps_result.scalars().all()

    if not snapshots:
        return {"outlet_id": outlet_id, "snapshots": [], "zone_averages": {}, "total_breaches": 0}

    # Aggregate averages
    zone_totals: dict = {}
    for snap in snapshots:
        for zone_id, occ in snap.zone_occupancy.items():
            zone_totals.setdefault(zone_id, []).append(occ)

    zone_averages = {zid: round(sum(vals) / len(vals), 3) for zid, vals in zone_totals.items()}
    total_breaches = sum(s.hygiene_breach_count for s in snapshots)

    return {
        "outlet_id": outlet_id,
        "snapshots": [s.__dict__ for s in snapshots[:24]],
        "zone_averages": zone_averages,
        "total_breaches": total_breaches,
        "peak_zone_id": snapshots[0].peak_zone_id if snapshots else None,
    }


@router.post("/outlet/{outlet_id}/heatmap/compute")
async def trigger_heatmap(
    outlet_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    background_tasks.add_task(compute_hourly_heatmap, outlet_id, db)
    return {"status": "computing"}


# ── Zone transitions (ingested from vision pipeline) ──────────────────────

@router.post("/outlet/{outlet_id}/transitions")
async def ingest_transition(
    outlet_id: str,
    payload: ZoneTransitionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Called by inference pipeline when a person moves between zones."""
    from datetime import datetime

    transition = ZoneTransition(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        timestamp=datetime.utcnow(),
        **payload.model_dump(),
    )
    db.add(transition)
    await db.commit()

    # If hygiene breach, also publish real-time alert
    if payload.is_hygiene_breach:
        from services.redis_service import get_redis, publish_alert
        redis = await get_redis()
        await publish_alert(redis, outlet_id, {
            "outlet_id": outlet_id,
            "chef_id": payload.chef_id or "unknown",
            "chef_name": "Unknown Chef",
            "event_type": "hygiene_breach",
            "severity": "critical",
            "step_name": "Hygiene zone transition",
            "dish_name": "",
            "timestamp": transition.timestamp.isoformat(),
            "details": {
                "from_zone": payload.from_zone_id,
                "to_zone": payload.to_zone_id,
                "fssai_reference": "Schedule 4, Section 3.2",
            }
        })

    return {"id": transition.id}


# ── Layout recommendations ────────────────────────────────────────────────

@router.get("/outlet/{outlet_id}/recommendations")
async def get_recommendations(
    outlet_id: str,
    status: Optional[str] = "open",
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    query = select(LayoutRecommendation).where(LayoutRecommendation.outlet_id == outlet_id)
    if status:
        query = query.where(LayoutRecommendation.status == status)
    result = await db.execute(query.order_by(LayoutRecommendation.generated_at.desc()))
    return result.scalars().all()


@router.post("/outlet/{outlet_id}/recommendations/generate")
async def generate_recommendations(
    outlet_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    background_tasks.add_task(run_recommendation_engine, outlet_id, db)
    return {"status": "generating"}


@router.patch("/recommendations/{rec_id}")
async def update_recommendation_status(
    rec_id: str,
    payload: RecommendationStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager"]))
):
    valid_statuses = ["open", "in_progress", "resolved", "dismissed"]
    if payload.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid_statuses}")
    await db.execute(
        update(LayoutRecommendation)
        .where(LayoutRecommendation.id == rec_id)
        .values(status=payload.status)
    )
    await db.commit()
    return {"status": payload.status}


# ── Pre-assessment (floor plan analysis) ─────────────────────────────────

@router.post("/pre-assessment")
async def run_pre_assessment(
    outlet_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "partner"]))
):
    """
    Upload a floor plan image and get layout recommendations
    before construction is locked in.
    """
    import httpx, os

    image_bytes = await file.read()
    image_b64 = base64.b64encode(image_bytes).decode()

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "OpenAI API key not configured")

    prompt = """You are a commercial kitchen layout expert for Indian restaurants.
Analyse this floor plan image and identify potential operational issues.

Check for:
1. Distance between cold storage and main prep area (ideal: <5 steps)
2. Raw meat handling zone proximity to ready-to-eat zones (must be separated)
3. Hand wash basin placement at every raw handling exit
4. Plating station proximity to pass/pickup area (ideal: <3 steps)
5. Ventilation hood coverage over all high-heat cooking zones
6. Traffic flow bottlenecks and cross-contamination paths
7. Emergency exit access

For each issue found, provide:
- issue_type
- severity (critical/high/medium/low)
- description
- recommended_fix
- estimated_cost_inr (rough range)

Respond in JSON only as an array of findings."""

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "gpt-4o",
                "max_tokens": 1000,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {
                            "url": f"data:{file.content_type};base64,{image_b64}",
                            "detail": "high"
                        }},
                    ]
                }]
            }
        )

    if resp.status_code != 200:
        raise HTTPException(500, "Floor plan analysis failed")

    import json as jsonlib
    content = resp.json()["choices"][0]["message"]["content"]
    try:
        findings = jsonlib.loads(content.strip().strip("```json").strip("```"))
    except Exception:
        findings = [{"issue_type": "parse_error", "description": content}]

    return {
        "outlet_id": outlet_id,
        "assessment_type": "pre_construction",
        "findings": findings,
        "finding_count": len(findings),
        "critical_count": sum(1 for f in findings if f.get("severity") == "critical"),
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
