"""
Consumption Engine — turns raw events into theoretical vs actual usage per
item, per outlet-day. Theoretical usage comes from POS sale events x recipe
ingredient quantities; actual usage comes from the inventory ledger
(consumption/waste/adjustment transactions from Smart Scale, POS, and Jarvis).
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
from typing import List
import uuid

from database import (
    RawIngestEvent, RecipeIngredient, InventoryTransaction, InventoryItem,
    ConsumptionRecord, IngestSourceEnum, InventoryTxnTypeEnum,
)


async def compute_daily_consumption(outlet_id: str, period_date: datetime, db: AsyncSession) -> List[ConsumptionRecord]:
    day_start = period_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    # Theoretical: POS sale events -> dish quantities sold that day
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
    dish_qty: dict = {}
    for evt in sales_result.scalars().all():
        dish_id = evt.payload.get("dish_id")
        qty = evt.payload.get("quantity", 0)
        if dish_id:
            dish_qty[dish_id] = dish_qty.get(dish_id, 0) + qty

    theoretical_by_item: dict = {}
    if dish_qty:
        recipe_result = await db.execute(
            select(RecipeIngredient).where(RecipeIngredient.dish_id.in_(dish_qty.keys()))
        )
        for ri in recipe_result.scalars().all():
            sold = dish_qty.get(ri.dish_id, 0)
            theoretical_by_item[ri.item_id] = theoretical_by_item.get(ri.item_id, 0) + sold * ri.quantity_per_serving

    # Actual: negative inventory transactions (consumption/waste/adjustment) that day
    txn_result = await db.execute(
        select(InventoryTransaction).where(
            and_(
                InventoryTransaction.outlet_id == outlet_id,
                InventoryTransaction.occurred_at >= day_start,
                InventoryTransaction.occurred_at < day_end,
                InventoryTransaction.txn_type.in_([
                    InventoryTxnTypeEnum.consumption,
                    InventoryTxnTypeEnum.waste,
                    InventoryTxnTypeEnum.adjustment,
                ]),
            )
        )
    )
    actual_by_item: dict = {}
    source_breakdown: dict = {}
    for txn in txn_result.scalars().all():
        if txn.quantity >= 0:
            continue
        qty = abs(txn.quantity)
        actual_by_item[txn.item_id] = actual_by_item.get(txn.item_id, 0) + qty
        bucket = source_breakdown.setdefault(txn.item_id, {})
        bucket[txn.txn_type] = bucket.get(txn.txn_type, 0) + qty

    item_ids = set(theoretical_by_item) | set(actual_by_item)
    if not item_ids:
        return []

    items_result = await db.execute(select(InventoryItem).where(InventoryItem.id.in_(item_ids)))
    items = {i.id: i for i in items_result.scalars().all()}

    records = []
    for item_id in item_ids:
        item = items.get(item_id)
        unit = item.unit if item else "kg"

        existing_result = await db.execute(
            select(ConsumptionRecord).where(
                and_(
                    ConsumptionRecord.outlet_id == outlet_id,
                    ConsumptionRecord.item_id == item_id,
                    ConsumptionRecord.period_date == day_start,
                )
            )
        )
        record = existing_result.scalar_one_or_none()
        theoretical = theoretical_by_item.get(item_id, 0.0)
        actual = actual_by_item.get(item_id, 0.0)
        breakdown = source_breakdown.get(item_id, {})

        if record:
            record.theoretical_qty = theoretical
            record.actual_qty = actual
            record.source_breakdown = breakdown
            record.computed_at = datetime.utcnow()
        else:
            record = ConsumptionRecord(
                id=str(uuid.uuid4()),
                outlet_id=outlet_id,
                item_id=item_id,
                period_date=day_start,
                theoretical_qty=theoretical,
                actual_qty=actual,
                unit=unit,
                source_breakdown=breakdown,
            )
            db.add(record)
        records.append(record)

    await db.commit()
    for r in records:
        await db.refresh(r)
    return records
