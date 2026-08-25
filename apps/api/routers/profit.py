from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta

from database import get_db, ProfitImpactSnapshot
from middleware.auth import require_roles
from services.profit_engine import run_daily_pipeline_for_outlet

router = APIRouter()

VIEW_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]


@router.get("/outlet/{outlet_id}")
async def list_profit_snapshots(
    outlet_id: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(ProfitImpactSnapshot)
        .where(and_(ProfitImpactSnapshot.outlet_id == outlet_id, ProfitImpactSnapshot.period_date >= since))
        .order_by(ProfitImpactSnapshot.period_date.desc())
    )
    return result.scalars().all()


@router.get("/outlet/{outlet_id}/summary")
async def profit_summary(
    outlet_id: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(ProfitImpactSnapshot)
        .where(and_(ProfitImpactSnapshot.outlet_id == outlet_id, ProfitImpactSnapshot.period_date >= since))
    )
    snapshots = result.scalars().all()
    revenue = sum(s.revenue_inr for s in snapshots)
    total_variance = sum(s.total_variance_cost_inr for s in snapshots)
    return {
        "outlet_id": outlet_id,
        "period_days": days,
        "revenue_inr": revenue,
        "waste_cost_inr": sum(s.waste_cost_inr for s in snapshots),
        "leakage_cost_inr": sum(s.leakage_cost_inr for s in snapshots),
        "portion_cost_inr": sum(s.portion_cost_inr for s in snapshots),
        "total_variance_cost_inr": total_variance,
        "margin_erosion_percent": round((total_variance / revenue * 100), 2) if revenue else 0.0,
    }


@router.post("/outlet/{outlet_id}/recompute")
async def recompute_profit(
    outlet_id: str,
    date: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_manager"])),
):
    day = datetime.fromisoformat(date)
    snapshot = await run_daily_pipeline_for_outlet(outlet_id, day, db)
    return snapshot
