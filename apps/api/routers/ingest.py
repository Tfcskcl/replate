from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from services import ingestion_service

router = APIRouter()


class IngestPayload(BaseModel):
    outlet_id: str
    event_type: str
    payload: dict = {}


@router.post("/{provider_key}")
async def ingest_event(provider_key: str, body: IngestPayload, db: AsyncSession = Depends(get_db)):
    """
    Called by any registered provider (POS/ERP, smart scale, or a vision
    vendor like Jarvis) to push an event. `provider_key` must match a
    registered, active row in the provider registry (see
    /api/providers) — unregistered keys are rejected rather than silently
    guessed at, so onboarding a new vendor is always an explicit step.
    Authenticate with an X-API-Key header, same as edge devices.
    """
    merged = {**body.payload, "event_type": body.event_type}
    try:
        raw = await ingestion_service.ingest(body.outlet_id, provider_key, merged, db)
    except ingestion_service.UnknownProviderError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ingested", "event_id": raw.id, "processed": raw.processed}
