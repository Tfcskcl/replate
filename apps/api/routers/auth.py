"""auth.py - Clerk webhook handler + user profile management"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid, hmac, hashlib, os
from database import get_db, UserProfile
from middleware.auth import get_current_user

router = APIRouter()

class UserProfileCreate(BaseModel):
    clerk_id: str
    email: str
    name: str
    role: str = "restaurant_manager"
    partner_id: Optional[str] = None
    restaurant_id: Optional[str] = None

@router.post("/webhook")
async def clerk_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Clerk webhooks for user creation/deletion."""
    payload = await request.json()
    event_type = payload.get("type")

    if event_type == "user.created":
        data = payload.get("data", {})
        user = UserProfile(
            id=str(uuid.uuid4()),
            clerk_id=data["id"],
            email=data.get("email_addresses", [{}])[0].get("email_address", ""),
            name=f"{data.get('first_name', '')} {data.get('last_name', '')}".strip(),
            role=data.get("public_metadata", {}).get("role", "restaurant_manager"),
        )
        db.add(user)
        await db.commit()
    return {"status": "ok"}

@router.get("/me")
async def get_me(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(UserProfile).where(UserProfile.clerk_id == user["id"]))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile
