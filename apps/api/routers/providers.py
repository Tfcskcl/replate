from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from database import get_db, ProviderTypeEnum
from middleware.auth import require_roles
from services import provider_registry

router = APIRouter()

VIEW_ROLES = ["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]
MANAGE_ROLES = ["super_admin", "replate_team"]


@router.get("")
async def list_providers(
    provider_type: Optional[ProviderTypeEnum] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(VIEW_ROLES)),
):
    return await provider_registry.list_providers(db, provider_type)


class RegisterProviderPayload(BaseModel):
    key: str
    provider_type: ProviderTypeEnum
    name: str
    config: dict = {}


@router.post("")
async def register_provider(
    body: RegisterProviderPayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(MANAGE_ROLES)),
):
    """
    Register a new vendor — e.g. a second vision provider, or a specific
    POS partner. Nothing in the ingestion or engine layer changes: the new
    provider starts receiving events the moment something POSTs to
    /api/ingest/{key}.
    """
    try:
        return await provider_registry.register_provider(db, body.key, body.provider_type, body.name, body.config)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


class SetActivePayload(BaseModel):
    is_active: bool


@router.patch("/{key}/active")
async def set_provider_active(
    key: str,
    body: SetActivePayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(MANAGE_ROLES)),
):
    """Deactivating a provider stops new events from that key without deleting its history."""
    provider = await provider_registry.set_provider_active(db, key, body.is_active)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{key}' not found")
    return provider
