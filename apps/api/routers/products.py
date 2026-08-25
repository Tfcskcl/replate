from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from middleware.auth import require_roles
from services import product_registry

router = APIRouter()

VIEW_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]
MANAGE_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager"]


@router.get("")
async def list_products(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    return await product_registry.list_products(db)


class ProductPayload(BaseModel):
    sku_code: str
    name: str
    category: str = "uncategorized"
    default_unit: str = "kg"


@router.post("")
async def create_product(
    body: ProductPayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(MANAGE_ROLES)),
):
    """
    Register a canonical Product/SKU. Provider ingestion and recipe
    ingredients will also create a Product on first reference to a SKU, so
    this endpoint mainly exists for pre-seeding a catalog or fixing a name/
    category before first use.
    """
    existing = await product_registry.get_product_by_sku(db, body.sku_code)
    if existing:
        raise HTTPException(status_code=409, detail=f"Product with sku_code '{body.sku_code}' already exists")
    product = await product_registry.get_or_create_product(
        db, body.sku_code, unit=body.default_unit, name=body.name, category=body.category
    )
    await db.commit()
    await db.refresh(product)
    return product
