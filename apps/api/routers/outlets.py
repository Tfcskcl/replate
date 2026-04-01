from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
import uuid
from database import get_db, Outlet
from middleware.auth import require_roles

router = APIRouter()

class OutletCreate(BaseModel):
    restaurant_id: str
    name: str
    address: str
    city: str
    state: str
    pincode: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    plan: str = "starter"

class OutletUpdate(BaseModel):
    plan: Optional[str] = None
    is_active: Optional[bool] = None
    go_live_date: Optional[str] = None

@router.get("/")
async def list_outlets(restaurant_id: Optional[str] = None, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","partner","restaurant_owner","restaurant_manager"]))):
    query = select(Outlet)
    if restaurant_id:
        query = query.where(Outlet.restaurant_id == restaurant_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/")
async def create_outlet(payload: OutletCreate, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","partner"]))):
    o = Outlet(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(o)
    await db.commit()
    await db.refresh(o)
    return o

@router.get("/{outlet_id}")
async def get_outlet(outlet_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","partner","restaurant_owner","restaurant_manager"]))):
    result = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    o = result.scalar_one_or_none()
    if not o: raise HTTPException(404, "Outlet not found")
    return o

@router.patch("/{outlet_id}")
async def update_outlet(outlet_id: str, payload: OutletUpdate, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team"]))):
    values = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.execute(update(Outlet).where(Outlet.id == outlet_id).values(**values))
    await db.commit()
    result = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    return result.scalar_one()
