from fastapi import Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError
import hmac
import httpx
import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Genuinely public, exact-match paths.
#
# Device ingestion endpoints are deliberately NOT listed: they authenticate
# with X-API-Key in the middleware below. Listing them here would make them
# unauthenticated outright, which is what previously left
# /api/compliance/ingest and /api/stream/frame writable by anyone.
PUBLIC_PATHS = {
    "/health",
    # Signature-verified, not unauthenticated: routers/auth.py rejects any
    # request without a valid Clerk/Svix signature. It cannot carry a bearer
    # token because Clerk's servers, not a user, make the call.
    "/api/auth/webhook",
}

# Interactive API docs expose the full route map. Fine locally, not on a
# public production URL.
if ENVIRONMENT != "production":
    PUBLIC_PATHS |= {"/docs", "/openapi.json", "/redoc"}

# Prefix entries must end in '/' so they cannot match a sibling path.
PUBLIC_PREFIXES: set = set()

security = HTTPBearer(auto_error=False)


def _is_public(path: str) -> bool:
    """Exact match, or a prefix match only where the entry ends in '/'.

    The previous `startswith` over bare entries was both too loose and, for
    the device heartbeat, simply wrong: the real route is
    /api/devices/{id}/heartbeat, which never matched the literal
    "/api/devices/heartbeat" prefix.
    """
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(p) for p in PUBLIC_PREFIXES)


class ClerkAuthMiddleware(BaseHTTPMiddleware):
    """
    Authenticates every request before it reaches a route.

    This middleware FAILS CLOSED. It previously called `call_next` on every
    path — a request with no token, or an invalid one, was passed straight
    through with `request.state.user_id` simply unset. That made protection
    entirely dependent on each route remembering to declare `require_roles`,
    and eleven routes did not, so on a public URL they were open to anyone.
    A rejected request must never reach a handler.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if _is_public(path):
            return await call_next(request)

        # CORS preflight carries no credentials by design.
        if request.method == "OPTIONS":
            return await call_next(request)

        # WebSockets authenticate inside the route (the handshake carries no
        # Authorization header); see routers/ws.py.
        if path.startswith("/ws/"):
            return await call_next(request)

        # Edge/device auth. A supplied key must be valid — an invalid one is
        # rejected here rather than falling through to user auth.
        device_api_key = request.headers.get("X-API-Key")
        if device_api_key:
            if await verify_device_api_key(device_api_key):
                request.state.is_device = True
                return await call_next(request)
            return _unauthorized("Invalid device API key")

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return _unauthorized("Authentication required")

        token = auth_header.split(" ", 1)[1]
        try:
            payload = await verify_clerk_token(token)
        except Exception as e:
            logger.info(f"Rejected request to {path}: token verification failed ({e})")
            return _unauthorized("Invalid or expired token")

        request.state.user_id = payload.get("sub")
        request.state.user_email = payload.get("email")
        request.state.user_role = payload.get("public_metadata", {}).get("role", "restaurant_manager")

        return await call_next(request)


def _unauthorized(detail: str) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": detail})


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
    """
    Verify an edge/device API key.

    Currently a single shared secret for the whole fleet, which means a
    compromised device cannot be revoked individually — tracked as a known
    limitation to replace with per-device keys stored on the devices table.

    Fails closed: if DEVICE_API_KEY is unset, no device key is accepted.
    Compared with compare_digest so the check is not timing-sensitive.
    """
    expected = os.getenv("DEVICE_API_KEY", "")
    if not expected or not api_key:
        return False
    return hmac.compare_digest(api_key, expected)


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
