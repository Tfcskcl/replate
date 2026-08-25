from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from database import get_db, VarianceRecord
from middleware.auth import require_roles
from services.variance_engine import compute_daily_variance

router = APIRouter()

VIEW_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]


@router.get("/outlet/{outlet_id}")
async def list_variance(
    outlet_id: str,
    variance_type: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    query = select(VarianceRecord).where(VarianceRecord.outlet_id == outlet_id)
    if variance_type:
        query = query.where(VarianceRecord.variance_type == variance_type)
    if status:
        query = query.where(VarianceRecord.status == status)
    if start_date:
        query = query.where(VarianceRecord.period_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(VarianceRecord.period_date <= datetime.fromisoformat(end_date))
    query = query.order_by(VarianceRecord.cost_impact_inr.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/outlet/{outlet_id}/recompute")
async def recompute_variance(
    outlet_id: str,
    date: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"])),
):
    day = datetime.fromisoformat(date)
    records = await compute_daily_variance(outlet_id, day, db)
    return {"status": "recomputed", "count": len(records)}


class StatusPayload(BaseModel):
    status: str


@router.patch("/{variance_id}/status")
async def update_status(
    variance_id: str,
    body: StatusPayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"])),
):
    await db.execute(update(VarianceRecord).where(VarianceRecord.id == variance_id).values(status=body.status))
    await db.commit()
    return {"status": "updated"}
