"""staff.py"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid
from database import get_db, Staff
from middleware.auth import require_roles

router = APIRouter()

class StaffCreate(BaseModel):
    outlet_id: str
    name: str
    role: str
    phone: Optional[str] = None

@router.get("/outlet/{outlet_id}")
async def list_staff(outlet_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_owner","restaurant_manager","partner"]))):
    result = await db.execute(select(Staff).where(Staff.outlet_id == outlet_id, Staff.is_active == True))
    return result.scalars().all()

@router.post("/")
async def create_staff(payload: StaffCreate, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_owner","restaurant_manager"]))):
    s = Staff(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s

@router.delete("/{staff_id}")
async def deactivate_staff(staff_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_manager"]))):
    from sqlalchemy import update as upd
    await db.execute(upd(Staff).where(Staff.id == staff_id).values(is_active=False))
    await db.commit()
    return {"deactivated": staff_id}
