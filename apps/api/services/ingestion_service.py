"""
Event ingestion layer — normalizes events from POS/ERP, Smart Scale, and
Jarvis (Staqu video analytics) into re-plate's internal model, then
dispatches them into the inventory and people engines. Every event is kept
as a RawIngestEvent for audit/replay regardless of whether it processed
cleanly, mirroring how ComplianceEvent captures edge-device events.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import uuid
import logging

from database import RawIngestEvent, IngestSourceEnum, InventoryTxnTypeEnum, PeopleEvent
from services import inventory_engine

logger = logging.getLogger(__name__)


async def ingest(outlet_id: str, source: IngestSourceEnum, payload: dict, db: AsyncSession) -> RawIngestEvent:
    event_type = payload.get("event_type", "unknown")
    raw = RawIngestEvent(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        source=source,
        event_type=event_type,
        payload=payload,
        received_at=datetime.utcnow(),
    )
    db.add(raw)
    await db.flush()

    try:
        await _dispatch(outlet_id, source, event_type, payload, db)
        raw.processed = True
    except Exception as e:
        raw.processing_error = str(e)
        logger.error(f"Failed to process {source}/{event_type} for outlet {outlet_id}: {e}")

    await db.commit()
    await db.refresh(raw)
    return raw


async def _dispatch(outlet_id: str, source: IngestSourceEnum, event_type: str, payload: dict, db: AsyncSession):
    if source == IngestSourceEnum.pos_erp:
        await _handle_pos_event(outlet_id, event_type, payload, db)
    elif source == IngestSourceEnum.smart_scale:
        await _handle_scale_event(outlet_id, event_type, payload, db)
    elif source == IngestSourceEnum.jarvis:
        await _handle_jarvis_event(outlet_id, event_type, payload, db)


async def _handle_pos_event(outlet_id: str, event_type: str, payload: dict, db: AsyncSession):
    if event_type == "sale":
        # payload: {dish_id, dish_name, quantity, line_total, occurred_at}
        # POS doesn't know ingredient quantities — theoretical consumption
        # is derived later by the consumption engine from RecipeIngredient
        # x same-day sale events, so there's nothing to apply here.
        return

    if event_type == "purchase":
        # payload: {sku, quantity, unit, unit_cost_inr, reference_id, occurred_at}
        await inventory_engine.apply_transaction(
            db, outlet_id,
            sku=payload["sku"],
            quantity=abs(payload["quantity"]),
            unit=payload.get("unit", "kg"),
            unit_cost_inr=payload.get("unit_cost_inr", 0.0),
            txn_type=InventoryTxnTypeEnum.purchase,
            source=IngestSourceEnum.pos_erp,
            reference_id=payload.get("reference_id"),
            occurred_at=_parse_ts(payload.get("occurred_at")),
        )
    elif event_type == "stock_adjustment":
        await inventory_engine.apply_transaction(
            db, outlet_id,
            sku=payload["sku"],
            quantity=payload["quantity"],
            unit=payload.get("unit", "kg"),
            unit_cost_inr=payload.get("unit_cost_inr", 0.0),
            txn_type=InventoryTxnTypeEnum.adjustment,
            source=IngestSourceEnum.pos_erp,
            reference_id=payload.get("reference_id"),
            occurred_at=_parse_ts(payload.get("occurred_at")),
        )


async def _handle_scale_event(outlet_id: str, event_type: str, payload: dict, db: AsyncSession):
    if event_type != "weight_reading":
        return

    # payload: {sku, weight_kg, reading_type: "stock_count"|"waste"|"portion", dish_id?, reference_id?}
    reading_type = payload.get("reading_type", "stock_count")
    txn_type = {
        "stock_count": InventoryTxnTypeEnum.count,
        "waste": InventoryTxnTypeEnum.waste,
        "portion": InventoryTxnTypeEnum.consumption,
    }.get(reading_type, InventoryTxnTypeEnum.count)

    qty = payload["weight_kg"]
    if txn_type in (InventoryTxnTypeEnum.waste, InventoryTxnTypeEnum.consumption):
        qty = -abs(qty)

    await inventory_engine.apply_transaction(
        db, outlet_id,
        sku=payload["sku"],
        quantity=qty,
        unit="kg",
        unit_cost_inr=payload.get("unit_cost_inr", 0.0),
        txn_type=txn_type,
        source=IngestSourceEnum.smart_scale,
        reference_id=payload.get("reference_id"),
        dish_id=payload.get("dish_id"),
        occurred_at=_parse_ts(payload.get("occurred_at")),
        notes=payload.get("notes"),
    )


async def _handle_jarvis_event(outlet_id: str, event_type: str, payload: dict, db: AsyncSession):
    # payload: {zone_id?, staff_id?, person_count?, confidence?, occurred_at, ...}
    evt = PeopleEvent(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        source=IngestSourceEnum.jarvis,
        event_type=event_type,
        zone_id=payload.get("zone_id"),
        staff_id=payload.get("staff_id"),
        person_count=payload.get("person_count"),
        confidence=payload.get("confidence"),
        details=payload,
        occurred_at=_parse_ts(payload.get("occurred_at")),
    )
    db.add(evt)
    await db.flush()

    # An "unrecorded_removal" event (Jarvis saw stock leave frame near an
    # inventory zone with no matching POS/scale transaction) is itself
    # leakage evidence — record it as a negative inventory movement so the
    # variance engine's actual_qty accounts for it.
    if event_type == "unrecorded_removal" and payload.get("sku"):
        await inventory_engine.apply_transaction(
            db, outlet_id,
            sku=payload["sku"],
            quantity=-abs(payload.get("quantity", 0)),
            unit=payload.get("unit", "kg"),
            unit_cost_inr=payload.get("unit_cost_inr", 0.0),
            txn_type=InventoryTxnTypeEnum.adjustment,
            source=IngestSourceEnum.jarvis,
            reference_id=payload.get("reference_id"),
            occurred_at=_parse_ts(payload.get("occurred_at")),
            notes="Jarvis-detected unrecorded removal",
        )


def _parse_ts(value) -> datetime:
    if not value:
        return datetime.utcnow()
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)
