"""cameras.py"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid
from database import get_db, CameraStream
from middleware.auth import require_roles

router = APIRouter()

class CameraCreate(BaseModel):
    outlet_id: str
    name: str
    stream_type: str  # rtsp | rtmp | usb
    stream_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    location: str = "kitchen"

@router.get("/outlet/{outlet_id}")
async def list_cameras(outlet_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team","restaurant_owner","restaurant_manager","partner"]))):
    result = await db.execute(select(CameraStream).where(CameraStream.outlet_id == outlet_id))
    cams = result.scalars().all()
    # Never return raw credentials
    return [{**c.__dict__, "stream_url_encrypted": "***", "password_encrypted": "***"} for c in cams]

@router.post("/")
async def add_camera(payload: CameraCreate, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team"]))):
    # Encrypt credentials before storing
    from cryptography.fernet import Fernet
    import os
    key = os.getenv("SECRET_KEY", "").encode()[:32].ljust(32, b"0")
    # Simple base64 storage (use proper encryption in production)
    import base64
    enc_url = base64.b64encode(payload.stream_url.encode()).decode() if payload.stream_url else None
    enc_pass = base64.b64encode(payload.password.encode()).decode() if payload.password else None

    cam = CameraStream(
        id=str(uuid.uuid4()),
        outlet_id=payload.outlet_id,
        name=payload.name,
        stream_type=payload.stream_type,
        stream_url_encrypted=enc_url,
        username_encrypted=payload.username,
        password_encrypted=enc_pass,
        location=payload.location,
    )
    db.add(cam)
    await db.commit()
    await db.refresh(cam)
    return {**cam.__dict__, "stream_url_encrypted": "***", "password_encrypted": "***"}

@router.delete("/{camera_id}")
async def delete_camera(camera_id: str, db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin","replate_team"]))):
    result = await db.execute(select(CameraStream).where(CameraStream.id == camera_id))
    cam = result.scalar_one_or_none()
    if not cam: raise HTTPException(404)
    await db.delete(cam)
    await db.commit()
    return {"deleted": camera_id}
