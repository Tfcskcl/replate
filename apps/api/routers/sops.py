from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid, hashlib, json

from database import get_db, SOPRecord, SOPStep, Dish
from middleware.auth import require_roles
from services.storage import upload_video_to_r2
from services.sop_service import compute_lock_hash, annotate_frame_extract

router = APIRouter()

PLAN_MONTHLY = {"starter": 3000, "pro": 6500, "enterprise": 12000}
PARTNER_SHARE = 0.60


# ── Pydantic schemas ──────────────────────────────────────────────────────

class IngredientRefSchema(BaseModel):
    name: str
    quantity_grams: Optional[float] = None
    quantity_ml: Optional[float] = None
    quantity_units: Optional[int] = None
    tolerance_percent: float = 0.15


class SOPStepCreate(BaseModel):
    step_number: int
    name: str
    start_timestamp_sec: float
    end_timestamp_sec: float
    allowed_duration_min_sec: float
    allowed_duration_max_sec: float
    required_ingredients: List[IngredientRefSchema] = []
    visual_checkpoint: str
    is_critical: bool = True
    can_be_skipped: bool = False
    reference_frame_url: Optional[str] = None


class SOPStepUpdate(SOPStepCreate):
    pass


class SOPCreate(BaseModel):
    outlet_id: str
    dish_id: str
    dish_name: str
    recorded_by: str


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/outlet/{outlet_id}")
async def list_sops(
    outlet_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    result = await db.execute(
        select(SOPRecord).where(SOPRecord.outlet_id == outlet_id).order_by(SOPRecord.recorded_at.desc())
    )
    return result.scalars().all()


@router.post("/")
async def create_sop(
    payload: SOPCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"]))
):
    sop = SOPRecord(
        id=str(uuid.uuid4()),
        outlet_id=payload.outlet_id,
        dish_id=payload.dish_id,
        dish_name=payload.dish_name,
        recorded_by=payload.recorded_by,
        video_url="",
        status="draft",
        version=1,
    )
    db.add(sop)
    await db.commit()
    await db.refresh(sop)
    return sop


@router.post("/{sop_id}/upload-video")
async def upload_video(
    sop_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"]))
):
    result = await db.execute(select(SOPRecord).where(SOPRecord.id == sop_id))
    sop = result.scalar_one_or_none()
    if not sop:
        raise HTTPException(404, "SOP not found")
    if sop.is_locked:
        raise HTTPException(400, "Cannot modify a locked SOP")

    video_bytes = await file.read()

    # Compute fingerprint
    fingerprint = hashlib.sha256(video_bytes).hexdigest()

    # Upload to R2
    video_url = await upload_video_to_r2(sop_id, video_bytes, file.content_type or "video/mp4")

    await db.execute(
        update(SOPRecord)
        .where(SOPRecord.id == sop_id)
        .values(video_url=video_url, video_fingerprint=fingerprint, status="annotating")
    )
    await db.commit()

    # Background: extract reference frames for annotation tool
    background_tasks.add_task(annotate_frame_extract, sop_id, video_url)

    return {"video_url": video_url, "fingerprint": fingerprint}


@router.post("/{sop_id}/steps")
async def add_step(
    sop_id: str,
    payload: SOPStepCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    result = await db.execute(select(SOPRecord).where(SOPRecord.id == sop_id))
    sop = result.scalar_one_or_none()
    if not sop:
        raise HTTPException(404, "SOP not found")
    if sop.is_locked:
        raise HTTPException(400, "Cannot modify a locked SOP")

    step = SOPStep(
        id=str(uuid.uuid4()),
        sop_id=sop_id,
        **payload.model_dump(),
    )
    db.add(step)
    await db.commit()
    await db.refresh(step)
    return step


@router.put("/{sop_id}/steps/{step_id}")
async def update_step(
    sop_id: str,
    step_id: str,
    payload: SOPStepUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    result = await db.execute(select(SOPRecord).where(SOPRecord.id == sop_id))
    sop = result.scalar_one_or_none()
    if not sop or sop.is_locked:
        raise HTTPException(400, "SOP not found or locked")

    await db.execute(
        update(SOPStep)
        .where(SOPStep.id == step_id, SOPStep.sop_id == sop_id)
        .values(**payload.model_dump())
    )
    await db.commit()
    return {"status": "updated"}


@router.post("/{sop_id}/lock")
async def lock_sop(
    sop_id: str,
    approved_by: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    """
    Atomically lock an SOP.
    Computes SHA-256(video_fingerprint + canonical_steps_json) → lock_hash.
    Once locked, record is immutable.
    """
    result = await db.execute(
        select(SOPRecord).where(SOPRecord.id == sop_id)
    )
    sop = result.scalar_one_or_none()
    if not sop:
        raise HTTPException(404, "SOP not found")
    if sop.is_locked:
        raise HTTPException(400, "SOP is already locked")
    if not sop.video_fingerprint:
        raise HTTPException(400, "Cannot lock: no video uploaded yet")

    # Load steps
    steps_result = await db.execute(
        select(SOPStep).where(SOPStep.sop_id == sop_id).order_by(SOPStep.step_number)
    )
    steps = steps_result.scalars().all()
    if not steps:
        raise HTTPException(400, "Cannot lock: no steps annotated yet")

    # Canonical JSON (sorted keys, no whitespace)
    steps_data = [
        {
            "step_number": s.step_number,
            "name": s.name,
            "start_timestamp_sec": s.start_timestamp_sec,
            "end_timestamp_sec": s.end_timestamp_sec,
            "allowed_duration_min_sec": s.allowed_duration_min_sec,
            "allowed_duration_max_sec": s.allowed_duration_max_sec,
            "required_ingredients": s.required_ingredients,
            "visual_checkpoint": s.visual_checkpoint,
            "is_critical": s.is_critical,
            "can_be_skipped": s.can_be_skipped,
        }
        for s in steps
    ]
    steps_json = json.dumps(steps_data, sort_keys=True, separators=(",", ":"))

    lock_hash = hashlib.sha256(
        (sop.video_fingerprint + steps_json).encode()
    ).hexdigest()

    # Atomic update
    await db.execute(
        update(SOPRecord)
        .where(SOPRecord.id == sop_id)
        .values(
            is_locked=True,
            locked_at=datetime.utcnow(),
            lock_hash=lock_hash,
            approved_by=approved_by,
            status="locked",
        )
    )
    await db.commit()

    return {
        "sop_id": sop_id,
        "lock_hash": lock_hash,
        "locked_at": datetime.utcnow().isoformat(),
        "approved_by": approved_by,
        "steps_count": len(steps),
    }


@router.get("/{sop_id}/verify")
async def verify_sop(
    sop_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Verify that a locked SOP's hash is still valid (tamper detection)."""
    result = await db.execute(select(SOPRecord).where(SOPRecord.id == sop_id))
    sop = result.scalar_one_or_none()
    if not sop or not sop.is_locked:
        raise HTTPException(400, "SOP not found or not locked")

    steps_result = await db.execute(
        select(SOPStep).where(SOPStep.sop_id == sop_id).order_by(SOPStep.step_number)
    )
    steps = steps_result.scalars().all()
    steps_data = [
        {
            "step_number": s.step_number,
            "name": s.name,
            "start_timestamp_sec": s.start_timestamp_sec,
            "end_timestamp_sec": s.end_timestamp_sec,
            "allowed_duration_min_sec": s.allowed_duration_min_sec,
            "allowed_duration_max_sec": s.allowed_duration_max_sec,
            "required_ingredients": s.required_ingredients,
            "visual_checkpoint": s.visual_checkpoint,
            "is_critical": s.is_critical,
            "can_be_skipped": s.can_be_skipped,
        }
        for s in steps
    ]
    steps_json = json.dumps(steps_data, sort_keys=True, separators=(",", ":"))
    computed = hashlib.sha256((sop.video_fingerprint + steps_json).encode()).hexdigest()

    is_valid = computed == sop.lock_hash
    return {
        "sop_id": sop_id,
        "is_valid": is_valid,
        "stored_hash": sop.lock_hash,
        "computed_hash": computed,
        "tampered": not is_valid,
    }


@router.get("/{sop_id}")
async def get_sop(sop_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SOPRecord).where(SOPRecord.id == sop_id))
    sop = result.scalar_one_or_none()
    if not sop:
        raise HTTPException(404, "SOP not found")

    steps_result = await db.execute(
        select(SOPStep).where(SOPStep.sop_id == sop_id).order_by(SOPStep.step_number)
    )
    steps = steps_result.scalars().all()

    return {**sop.__dict__, "steps": [s.__dict__ for s in steps]}
