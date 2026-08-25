from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import Optional

from database import get_db, ConsumptionRecord
from middleware.auth import require_roles
from services.consumption_engine import compute_daily_consumption

router = APIRouter()

VIEW_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]


@router.get("/outlet/{outlet_id}")
async def list_consumption(
    outlet_id: str,
    date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    query = select(ConsumptionRecord).where(ConsumptionRecord.outlet_id == outlet_id)
    if date:
        day = datetime.fromisoformat(date).replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.where(ConsumptionRecord.period_date == day)
    query = query.order_by(ConsumptionRecord.period_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/outlet/{outlet_id}/recompute")
async def recompute_consumption(
    outlet_id: str,
    date: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"])),
):
    day = datetime.fromisoformat(date)
    records = await compute_daily_consumption(outlet_id, day, db)
    return {"status": "recomputed", "count": len(records)}
