"""
Variance Intelligence — compares theoretical vs actual consumption and
classifies each meaningful gap as waste, leakage, or portion control,
with a ₹ cost impact the Profit Engine rolls up.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
from typing import List
import uuid

from database import (
    ConsumptionRecord, InventoryItem, VarianceRecord, VarianceTypeEnum,
    VarianceStatusEnum, PeopleEvent, IngestSourceEnum,
)

VARIANCE_THRESHOLD_PERCENT = 5.0  # ignore noise under this


async def compute_daily_variance(outlet_id: str, period_date: datetime, db: AsyncSession) -> List[VarianceRecord]:
    day_start = period_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    records_result = await db.execute(
        select(ConsumptionRecord).where(
            and_(
                ConsumptionRecord.outlet_id == outlet_id,
                ConsumptionRecord.period_date == day_start,
            )
        )
    )
    consumption_records = records_result.scalars().all()
    if not consumption_records:
        return []

    item_ids = [r.item_id for r in consumption_records]
    items_result = await db.execute(select(InventoryItem).where(InventoryItem.id.in_(item_ids)))
    items = {i.id: i for i in items_result.scalars().all()}

    # Jarvis events that day which corroborate a gap as leakage rather than waste
    jarvis_result = await db.execute(
        select(PeopleEvent).where(
            and_(
                PeopleEvent.outlet_id == outlet_id,
                PeopleEvent.source == IngestSourceEnum.jarvis,
                PeopleEvent.event_type.in_(["unrecorded_removal", "unauthorized_access"]),
                PeopleEvent.occurred_at >= day_start,
                PeopleEvent.occurred_at < day_end,
            )
        )
    )
    leakage_signal = len(jarvis_result.scalars().all()) > 0

    out = []
    for rec in consumption_records:
        item = items.get(rec.item_id)
        if not item or rec.theoretical_qty <= 0:
            continue

        variance_qty = rec.actual_qty - rec.theoretical_qty
        variance_percent = (variance_qty / rec.theoretical_qty) * 100

        # Only "used more than expected" is a loss worth flagging; using
        # less than theoretical isn't charged (could just be a slow day).
        if variance_qty <= 0 or abs(variance_percent) < VARIANCE_THRESHOLD_PERCENT:
            continue

        waste_qty = rec.source_breakdown.get("waste", 0)
        if waste_qty >= variance_qty * 0.8:
            variance_type = VarianceTypeEnum.waste
            confidence = 0.8
        elif leakage_signal:
            variance_type = VarianceTypeEnum.leakage
            confidence = 0.7
        else:
            variance_type = VarianceTypeEnum.portion_control
            confidence = 0.5

        cost_impact = variance_qty * item.unit_cost_inr

        existing_result = await db.execute(
            select(VarianceRecord).where(
                and_(
                    VarianceRecord.outlet_id == outlet_id,
                    VarianceRecord.item_id == rec.item_id,
                    VarianceRecord.period_date == day_start,
                )
            )
        )
        variance = existing_result.scalar_one_or_none()
        if variance:
            variance.variance_type = variance_type
            variance.expected_qty = rec.theoretical_qty
            variance.actual_qty = rec.actual_qty
            variance.variance_qty = variance_qty
            variance.variance_percent = variance_percent
            variance.cost_impact_inr = cost_impact
            variance.confidence = confidence
            variance.evidence = rec.source_breakdown
            variance.detected_at = datetime.utcnow()
        else:
            variance = VarianceRecord(
                id=str(uuid.uuid4()),
                outlet_id=outlet_id,
                item_id=rec.item_id,
                variance_type=variance_type,
                period_date=day_start,
                expected_qty=rec.theoretical_qty,
                actual_qty=rec.actual_qty,
                variance_qty=variance_qty,
                variance_percent=variance_percent,
                cost_impact_inr=cost_impact,
                confidence=confidence,
                evidence=rec.source_breakdown,
                status=VarianceStatusEnum.open,
            )
            db.add(variance)
        out.append(variance)

    await db.commit()
    for v in out:
        await db.refresh(v)
    return out
