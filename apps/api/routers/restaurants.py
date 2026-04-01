"""restaurants.py"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
from database import get_db, Restaurant
from middleware.auth import require_roles

router = APIRouter()

class RestaurantCreate(BaseModel):
    partner_id: str
    name: str
    fssai_number: str
    cuisine_type: str
    owner_name: str
    owner_phone: str
    owner_email: EmailStr

@router.get("/")
async def list_restaurants(db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","partner"]))):
    result = await db.execute(select(Restaurant))
    return result.scalars().all()

@router.post("/")
async def create_restaurant(payload: RestaurantCreate, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","partner"]))):
    r = Restaurant(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r

@router.get("/{restaurant_id}")
async def get_restaurant(restaurant_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","partner","restaurant_owner","restaurant_manager"]))):
    result = await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))
    r = result.scalar_one_or_none()
    if not r: raise HTTPException(404, "Not found")
    return r
