from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid

from database import get_db, InventoryItem, InventoryTransaction, RecipeIngredient
from middleware.auth import require_roles

router = APIRouter()

VIEW_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]
MANAGE_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager"]


@router.get("/outlet/{outlet_id}/items")
async def list_items(
    outlet_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    result = await db.execute(
        select(InventoryItem).where(InventoryItem.outlet_id == outlet_id).order_by(InventoryItem.name)
    )
    return result.scalars().all()


@router.get("/outlet/{outlet_id}/items/{item_id}/transactions")
async def list_item_transactions(
    outlet_id: str,
    item_id: str,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    result = await db.execute(
        select(InventoryTransaction)
        .where(InventoryTransaction.outlet_id == outlet_id, InventoryTransaction.item_id == item_id)
        .order_by(InventoryTransaction.occurred_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


class RecipeIngredientPayload(BaseModel):
    dish_id: str
    item_id: str
    quantity_per_serving: float
    unit: str


@router.post("/recipe-ingredients")
async def add_recipe_ingredient(
    body: RecipeIngredientPayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(MANAGE_ROLES)),
):
    ri = RecipeIngredient(id=str(uuid.uuid4()), **body.model_dump())
    db.add(ri)
    await db.commit()
    await db.refresh(ri)
    return ri


@router.get("/dish/{dish_id}/recipe")
async def get_recipe(
    dish_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    result = await db.execute(select(RecipeIngredient).where(RecipeIngredient.dish_id == dish_id))
    return result.scalars().all()
