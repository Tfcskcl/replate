"""
Profit Engine — rolls revenue, COGS, and classified variance cost up into a
single per-outlet-day profit-impact snapshot for the dashboard/AI copilot.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
import uuid
import logging

from database import (
    RawIngestEvent, VarianceRecord, VarianceTypeEnum, ProfitImpactSnapshot,
    IngestSourceEnum, ConsumptionRecord, InventoryItem,
)

logger = logging.getLogger(__name__)


async def compute_daily_profit_impact(outlet_id: str, period_date: datetime, db: AsyncSession) -> ProfitImpactSnapshot:
    day_start = period_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    sales_result = await db.execute(
        select(RawIngestEvent).where(
            and_(
                RawIngestEvent.outlet_id == outlet_id,
                RawIngestEvent.source == IngestSourceEnum.pos_erp,
                RawIngestEvent.event_type == "sale",
                RawIngestEvent.received_at >= day_start,
                RawIngestEvent.received_at < day_end,
            )
        )
    )
    revenue = sum(evt.payload.get("line_total", 0.0) for evt in sales_result.scalars().all())

    consumption_result = await db.execute(
        select(ConsumptionRecord).where(
            and_(
                ConsumptionRecord.outlet_id == outlet_id,
                ConsumptionRecord.period_date == day_start,
            )
        )
    )
    consumption_records = consumption_result.scalars().all()
    item_ids = [r.item_id for r in consumption_records]
    items = {}
    if item_ids:
        items_result = await db.execute(select(InventoryItem).where(InventoryItem.id.in_(item_ids)))
        items = {i.id: i for i in items_result.scalars().all()}

    cogs_theoretical = sum(
        r.theoretical_qty * items[r.item_id].unit_cost_inr for r in consumption_records if r.item_id in items
    )
    cogs_actual = sum(
        r.actual_qty * items[r.item_id].unit_cost_inr for r in consumption_records if r.item_id in items
    )

    variance_result = await db.execute(
        select(VarianceRecord).where(
            and_(
                VarianceRecord.outlet_id == outlet_id,
                VarianceRecord.period_date == day_start,
            )
        )
    )
    variances = variance_result.scalars().all()
    waste_cost = sum(v.cost_impact_inr for v in variances if v.variance_type == VarianceTypeEnum.waste)
    leakage_cost = sum(v.cost_impact_inr for v in variances if v.variance_type == VarianceTypeEnum.leakage)
    portion_cost = sum(v.cost_impact_inr for v in variances if v.variance_type == VarianceTypeEnum.portion_control)
    total_variance_cost = waste_cost + leakage_cost + portion_cost

    margin_erosion_percent = (total_variance_cost / revenue * 100) if revenue else 0.0

    existing_result = await db.execute(
        select(ProfitImpactSnapshot).where(
            and_(
                ProfitImpactSnapshot.outlet_id == outlet_id,
                ProfitImpactSnapshot.period_date == day_start,
            )
        )
    )
    snapshot = existing_result.scalar_one_or_none()
    if not snapshot:
        snapshot = ProfitImpactSnapshot(id=str(uuid.uuid4()), outlet_id=outlet_id, period_date=day_start)
        db.add(snapshot)

    snapshot.revenue_inr = revenue
    snapshot.cogs_theoretical_inr = cogs_theoretical
    snapshot.cogs_actual_inr = cogs_actual
    snapshot.waste_cost_inr = waste_cost
    snapshot.leakage_cost_inr = leakage_cost
    snapshot.portion_cost_inr = portion_cost
    snapshot.total_variance_cost_inr = total_variance_cost
    snapshot.margin_erosion_percent = round(margin_erosion_percent, 2)
    snapshot.generated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(snapshot)
    return snapshot


async def run_daily_pipeline_for_outlet(outlet_id: str, period_date: datetime, db: AsyncSession) -> ProfitImpactSnapshot:
    """Runs consumption -> variance -> profit for one outlet-day, in order."""
    from services import consumption_engine, variance_engine

    await consumption_engine.compute_daily_consumption(outlet_id, period_date, db)
    await variance_engine.compute_daily_variance(outlet_id, period_date, db)
    return await compute_daily_profit_impact(outlet_id, period_date, db)


async def run_daily_pipeline_all_outlets():
    """Runs the full pipeline for yesterday, across all active outlets. Called nightly by the scheduler."""
    from database import AsyncSessionLocal, Outlet

    yesterday = datetime.utcnow() - timedelta(days=1)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Outlet).where(Outlet.is_active == True))
        outlets = result.scalars().all()
        for outlet in outlets:
            try:
                await run_daily_pipeline_for_outlet(outlet.id, yesterday, db)
            except Exception as e:
                logger.error(f"Profit pipeline failed for outlet {outlet.id}: {e}")
