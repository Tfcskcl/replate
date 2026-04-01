from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from database import get_db, TrainingModule
from middleware.auth import require_roles
from jobs.generate_training_plans import generate_training_plans_for_outlet

router = APIRouter()

class CompleteModulePayload(BaseModel):
    score: Optional[float] = None

@router.get("/chef/{chef_id}")
async def get_chef_modules(chef_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_manager","restaurant_owner","partner"]))):
    result = await db.execute(
        select(TrainingModule).where(TrainingModule.chef_id == chef_id)
        .order_by(TrainingModule.priority, TrainingModule.due_date))
    return result.scalars().all()

@router.get("/outlet/{outlet_id}/pending")
async def get_outlet_pending(outlet_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_manager","restaurant_owner","partner"]))):
    result = await db.execute(
        select(TrainingModule).where(
            and_(TrainingModule.outlet_id == outlet_id, TrainingModule.completed_at.is_(None))
        ).order_by(TrainingModule.priority))
    return result.scalars().all()

@router.patch("/{module_id}/complete")
async def complete_module(module_id: str, payload: CompleteModulePayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_manager"]))):
    await db.execute(update(TrainingModule).where(TrainingModule.id == module_id).values(
        completed_at=datetime.utcnow(), score=payload.score))
    await db.commit()
    return {"status": "completed"}

@router.post("/outlet/{outlet_id}/generate")
async def trigger_generate(outlet_id: str, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team"]))):
    background_tasks.add_task(generate_training_plans_for_outlet, outlet_id, db)
    return {"status": "generating"}
