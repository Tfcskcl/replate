from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import Optional
import uuid

from database import InventoryItem, InventoryTransaction, InventoryTxnTypeEnum, ProviderTypeEnum
from services import product_registry


async def get_or_create_item(
    db: AsyncSession,
    outlet_id: str,
    sku: str,
    unit: str = "kg",
    unit_cost_inr: float = 0.0,
    name: Optional[str] = None,
    category: str = "uncategorized",
) -> InventoryItem:
    """Resolve the canonical Product for `sku` first, then this outlet's
    stock row for that product — a provider event only ever names a SKU, so
    ingestion and the Product master stay in lockstep automatically."""
    product = await product_registry.get_or_create_product(db, sku, unit=unit, name=name, category=category)

    result = await db.execute(
        select(InventoryItem).where(InventoryItem.outlet_id == outlet_id, InventoryItem.product_id == product.id)
    )
    item = result.scalar_one_or_none()
    if item:
        return item

    item = InventoryItem(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        product_id=product.id,
        sku=product.sku_code,
        name=product.name,
        category=product.category,
        unit=unit,
        unit_cost_inr=unit_cost_inr,
        current_stock=0.0,
    )
    db.add(item)
    await db.flush()
    return item


async def apply_transaction(
    db: AsyncSession,
    outlet_id: str,
    sku: str,
    quantity: float,
    unit: str,
    unit_cost_inr: float,
    txn_type: InventoryTxnTypeEnum,
    source_provider: str,
    source_type: ProviderTypeEnum,
    reference_id: Optional[str] = None,
    dish_id: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
    notes: Optional[str] = None,
) -> InventoryTransaction:
    """
    Record one inventory movement and update the item's running stock level.
    `quantity` is signed: positive = stock in (purchase), negative = stock
    out (consumption/waste). A `count` transaction sets an absolute
    stock-take reading instead of applying a delta.
    """
    item = await get_or_create_item(db, outlet_id, sku, unit=unit, unit_cost_inr=unit_cost_inr or 0.0)
    if unit_cost_inr:
        item.unit_cost_inr = unit_cost_inr

    if txn_type == InventoryTxnTypeEnum.count:
        item.current_stock = quantity
    else:
        item.current_stock += quantity
    item.updated_at = datetime.utcnow()

    txn = InventoryTransaction(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        item_id=item.id,
        txn_type=txn_type,
        quantity=quantity,
        unit_cost_inr=item.unit_cost_inr,
        source_provider=source_provider,
        source_type=source_type,
        reference_id=reference_id,
        dish_id=dish_id,
        occurred_at=occurred_at or datetime.utcnow(),
        notes=notes,
    )
    db.add(txn)
    await db.flush()
    return txn
