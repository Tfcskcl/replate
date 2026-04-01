from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError
import httpx
import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"

# Public routes that don't need auth
PUBLIC_PATHS = {
    "/health",
    "/api/compliance/ingest",   # Called by edge devices with API key
    "/api/devices/heartbeat",
    "/api/stream/frame",
    "/docs",
    "/openapi.json",
    "/redoc",
}

security = HTTPBearer(auto_error=False)


class ClerkAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip public paths
        if any(path.startswith(p) for p in PUBLIC_PATHS):
            return await call_next(request)

        # WebSocket paths handled separately
        if path.startswith("/ws/"):
            return await call_next(request)

        # Device API key auth (for edge devices)
        device_api_key = request.headers.get("X-API-Key")
        if device_api_key and path.startswith("/api/"):
            valid = await verify_device_api_key(device_api_key)
            if valid:
                return await call_next(request)

        # JWT auth
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header.split(" ", 1)[1]
        try:
            payload = await verify_clerk_token(token)
            request.state.user_id = payload.get("sub")
            request.state.user_email = payload.get("email")
            request.state.user_role = payload.get("public_metadata", {}).get("role", "restaurant_manager")
        except Exception as e:
            logger.debug(f"Token verification failed: {e}")

        return await call_next(request)


async def verify_clerk_token(token: str) -> dict:
    """Verify Clerk JWT and return payload."""
    # In production, fetch JWKS and verify properly
    # For development, use Clerk's verify endpoint
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.clerk.com/v1/tokens/verify",
            headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
            json={"token": token},
        )
        if resp.status_code != 200:
            raise HTTPException(401, "Invalid token")
        return resp.json()


async def verify_device_api_key(api_key: str) -> bool:
    """Verify edge device API key against database."""
    # Simple check — in production, verify against DB
    expected = os.getenv("DEVICE_API_KEY", "")
    return bool(expected and api_key == expected)


def get_current_user(request: Request) -> dict:
    """Extract current user from request state."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    return {
        "id": user_id,
        "email": getattr(request.state, "user_email", ""),
        "role": getattr(request.state, "user_role", "restaurant_manager"),
    }


def require_roles(roles: list):
    """Dependency factory: require one of the specified roles."""
    def dependency(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Role '{user['role']}' not permitted. Required: {roles}")
        return user
    return dependency


def get_optional_user(request: Request) -> Optional[dict]:
    """Return user if authenticated, else None."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return None
    return {
        "id": user_id,
        "email": getattr(request.state, "user_email", ""),
        "role": getattr(request.state, "user_role", "restaurant_manager"),
    }
