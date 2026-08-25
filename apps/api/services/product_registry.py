"""
Product / SKU Master — the canonical identity of an item, independent of any
one outlet's stock row. InventoryItem is the per-outlet stock ledger;
RecipeIngredient and other cross-outlet references point at Product, so a
recipe or catalog entry authored once is valid at every outlet rather than
tied to the outlet it happened to be entered against.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import uuid

from database import Product


async def get_product_by_sku(db: AsyncSession, sku_code: str) -> Optional[Product]:
    result = await db.execute(select(Product).where(Product.sku_code == sku_code))
    return result.scalar_one_or_none()


async def get_or_create_product(
    db: AsyncSession,
    sku_code: str,
    unit: str = "kg",
    name: Optional[str] = None,
    category: str = "uncategorized",
) -> Product:
    product = await get_product_by_sku(db, sku_code)
    if product:
        return product

    product = Product(
        id=str(uuid.uuid4()),
        sku_code=sku_code,
        name=name or sku_code,
        category=category,
        default_unit=unit,
    )
    db.add(product)
    await db.flush()
    return product


async def list_products(db: AsyncSession) -> List[Product]:
    result = await db.execute(select(Product).order_by(Product.name))
    return result.scalars().all()
