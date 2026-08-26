"""auth.py - Clerk webhook handler + user profile management"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid, hmac, hashlib, os, base64, json, time
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

CLERK_WEBHOOK_SECRET = os.getenv("CLERK_WEBHOOK_SECRET", "")


def _verify_svix_signature(body: bytes, headers) -> bool:
    """
    Verify a Clerk (Svix) webhook signature.

    Without this the endpoint is an open user-provisioning API: it assigns
    `role` straight from the payload, so an unauthenticated caller could mint
    a super_admin profile. Signature verification is what makes the route
    safe to expose without a bearer token.

    Svix signs `{svix-id}.{svix-timestamp}.{body}` with HMAC-SHA256 using the
    secret after its `whsec_` prefix, base64-decoded. The signature header may
    carry several space-separated `v1,<sig>` values during key rotation.
    """
    if not CLERK_WEBHOOK_SECRET:
        return False

    svix_id = headers.get("svix-id")
    svix_timestamp = headers.get("svix-timestamp")
    svix_signature = headers.get("svix-signature")
    if not (svix_id and svix_timestamp and svix_signature):
        return False

    # Reject stale timestamps to blunt replay attacks.
    try:
        age = abs(time.time() - int(svix_timestamp))
    except ValueError:
        return False
    if age > 300:
        return False

    secret = CLERK_WEBHOOK_SECRET
    if secret.startswith("whsec_"):
        secret = secret[len("whsec_"):]
    try:
        secret_bytes = base64.b64decode(secret)
    except Exception:
        return False

    signed = f"{svix_id}.{svix_timestamp}.{body.decode()}".encode()
    expected = base64.b64encode(hmac.new(secret_bytes, signed, hashlib.sha256).digest()).decode()

    for part in svix_signature.split():
        _, _, candidate = part.partition(",")
        if candidate and hmac.compare_digest(candidate, expected):
            return True
    return False


@router.post("/webhook")
async def clerk_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Clerk webhooks for user creation/deletion."""
    body = await request.body()
    if not _verify_svix_signature(body, request.headers):
        raise HTTPException(401, "Invalid webhook signature")

    payload = json.loads(body)
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
