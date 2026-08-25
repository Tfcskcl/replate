"""
Event ingestion layer — normalizes events from any registered POS/ERP,
Smart Scale, or vision (e.g. Jarvis) provider into re-plate's internal
model, then dispatches them into the inventory and people engines.

Dispatch happens on `provider.provider_type` (pos / scale / vision /
manual), never on the specific vendor key — this is the seam described in
services/provider_registry.py. Adding a second vision vendor or a POS
partner never touches this file; it only needs a new Provider row, plus a
vendor-specific adapter function here IF that vendor's payload shape truly
differs from the normalised shape below (most won't).

Every event is kept as a RawIngestEvent for audit/replay regardless of
whether it processed cleanly, mirroring how ComplianceEvent captures
edge-device events.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import uuid
import logging

from database import RawIngestEvent, InventoryTxnTypeEnum, PeopleEvent, Provider, ProviderTypeEnum
from services import inventory_engine, provider_registry

logger = logging.getLogger(__name__)


class UnknownProviderError(Exception):
    pass


async def ingest(outlet_id: str, provider_key: str, payload: dict, db: AsyncSession) -> RawIngestEvent:
    provider = await provider_registry.get_provider(db, provider_key)
    if not provider or not provider.is_active:
        raise UnknownProviderError(f"'{provider_key}' is not a registered, active provider")

    event_type = payload.get("event_type", "unknown")
    raw = RawIngestEvent(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        source_provider=provider.key,
        source_type=provider.provider_type,
        event_type=event_type,
        payload=payload,
        received_at=datetime.utcnow(),
    )
    db.add(raw)
    await db.flush()

    try:
        await _dispatch(outlet_id, provider, event_type, payload, db)
        raw.processed = True
    except Exception as e:
        raw.processing_error = str(e)
        logger.error(f"Failed to process {provider.key}/{event_type} for outlet {outlet_id}: {e}")

    await db.commit()
    await db.refresh(raw)
    return raw


async def _dispatch(outlet_id: str, provider: Provider, event_type: str, payload: dict, db: AsyncSession):
    if provider.provider_type == ProviderTypeEnum.pos:
        await _handle_pos_event(outlet_id, provider.key, event_type, payload, db)
    elif provider.provider_type == ProviderTypeEnum.scale:
        await _handle_scale_event(outlet_id, provider.key, event_type, payload, db)
    elif provider.provider_type == ProviderTypeEnum.vision:
        await _handle_vision_event(outlet_id, provider.key, event_type, payload, db)


async def _handle_pos_event(outlet_id: str, provider_key: str, event_type: str, payload: dict, db: AsyncSession):
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
            source_provider=provider_key,
            source_type=ProviderTypeEnum.pos,
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
            source_provider=provider_key,
            source_type=ProviderTypeEnum.pos,
            reference_id=payload.get("reference_id"),
            occurred_at=_parse_ts(payload.get("occurred_at")),
        )


async def _handle_scale_event(outlet_id: str, provider_key: str, event_type: str, payload: dict, db: AsyncSession):
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
        source_provider=provider_key,
        source_type=ProviderTypeEnum.scale,
        reference_id=payload.get("reference_id"),
        dish_id=payload.get("dish_id"),
        occurred_at=_parse_ts(payload.get("occurred_at")),
        notes=payload.get("notes"),
    )


async def _handle_vision_event(outlet_id: str, provider_key: str, event_type: str, payload: dict, db: AsyncSession):
    # payload: {zone_id?, staff_id?, person_count?, confidence?, occurred_at, ...}
    # Normalised shape any vision vendor is expected to produce — see
    # Section C of the architecture blueprint for the full event contract.
    evt = PeopleEvent(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        source_provider=provider_key,
        source_type=ProviderTypeEnum.vision,
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

    # An "unrecorded_removal" event (a vision provider saw stock leave frame
    # near an inventory zone with no matching POS/scale transaction) is
    # itself leakage evidence — record it as a negative inventory movement
    # so the variance engine's actual_qty accounts for it.
    if event_type == "unrecorded_removal" and payload.get("sku"):
        await inventory_engine.apply_transaction(
            db, outlet_id,
            sku=payload["sku"],
            quantity=-abs(payload.get("quantity", 0)),
            unit=payload.get("unit", "kg"),
            unit_cost_inr=payload.get("unit_cost_inr", 0.0),
            txn_type=InventoryTxnTypeEnum.adjustment,
            source_provider=provider_key,
            source_type=ProviderTypeEnum.vision,
            reference_id=payload.get("reference_id"),
            occurred_at=_parse_ts(payload.get("occurred_at")),
            notes=f"{provider_key}-detected unrecorded removal",
        )


def _parse_ts(value) -> datetime:
    if not value:
        return datetime.utcnow()
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)
