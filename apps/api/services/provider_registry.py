"""
Provider registry — the AI/POS/scale vendor abstraction. This is what makes
re-plate never technically locked into one vision vendor (Jarvis today),
POS partner, or scale manufacturer: a vendor is a row in this table, not a
branch in the ingestion code. Swapping or adding a vendor is a database
write, not a deploy.

Every registered provider has a stable `provider_type` (pos / scale /
vision / manual) that the ingestion and query layers dispatch and filter
on — never the vendor-specific `key`. See database.py's module docstring
above RawIngestEvent for the source_provider/source_type split this exists
to support.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import uuid

from database import Provider, ProviderTypeEnum

# Seeded on startup so existing deployments keep working with zero manual
# setup. Operators add real vendors (a second CV provider, a specific POS
# partner) through the /api/providers endpoints, not by editing this list.
_DEFAULT_PROVIDERS = [
    {"key": "jarvis", "provider_type": ProviderTypeEnum.vision, "name": "Staqu Jarvis"},
    {"key": "smart_scale", "provider_type": ProviderTypeEnum.scale, "name": "Generic smart scale"},
    {"key": "pos_erp", "provider_type": ProviderTypeEnum.pos, "name": "Generic POS/ERP"},
    {"key": "manual", "provider_type": ProviderTypeEnum.manual, "name": "Manual entry"},
]


async def seed_default_providers(db: AsyncSession) -> None:
    """Idempotent — safe to call on every startup."""
    for spec in _DEFAULT_PROVIDERS:
        existing = await get_provider(db, spec["key"])
        if existing:
            continue
        db.add(Provider(
            id=str(uuid.uuid4()),
            key=spec["key"],
            provider_type=spec["provider_type"],
            name=spec["name"],
            is_active=True,
        ))
    await db.commit()


async def get_provider(db: AsyncSession, key: str) -> Optional[Provider]:
    result = await db.execute(select(Provider).where(Provider.key == key))
    return result.scalar_one_or_none()


async def list_providers(db: AsyncSession, provider_type: Optional[ProviderTypeEnum] = None) -> List[Provider]:
    query = select(Provider)
    if provider_type:
        query = query.where(Provider.provider_type == provider_type)
    result = await db.execute(query.order_by(Provider.provider_type, Provider.key))
    return result.scalars().all()


async def register_provider(
    db: AsyncSession,
    key: str,
    provider_type: ProviderTypeEnum,
    name: str,
    config: Optional[dict] = None,
) -> Provider:
    existing = await get_provider(db, key)
    if existing:
        raise ValueError(f"Provider '{key}' is already registered")

    provider = Provider(
        id=str(uuid.uuid4()),
        key=key,
        provider_type=provider_type,
        name=name,
        is_active=True,
        config=config or {},
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return provider


async def set_provider_active(db: AsyncSession, key: str, is_active: bool) -> Optional[Provider]:
    provider = await get_provider(db, key)
    if not provider:
        return None
    provider.is_active = is_active
    await db.commit()
    await db.refresh(provider)
    return provider
