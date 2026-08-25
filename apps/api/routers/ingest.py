from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, IngestSourceEnum
from services import ingestion_service

router = APIRouter()


class IngestPayload(BaseModel):
    outlet_id: str
    event_type: str
    payload: dict = {}


@router.post("/pos")
async def ingest_pos(body: IngestPayload, db: AsyncSession = Depends(get_db)):
    """
    Called by connected POS/ERP systems (sale, purchase, stock_adjustment
    events). Authenticate with an X-API-Key header, same as edge devices.
    """
    merged = {**body.payload, "event_type": body.event_type}
    raw = await ingestion_service.ingest(body.outlet_id, IngestSourceEnum.pos_erp, merged, db)
    return {"status": "ingested", "event_id": raw.id, "processed": raw.processed}


@router.post("/scale")
async def ingest_scale(body: IngestPayload, db: AsyncSession = Depends(get_db)):
    """Called by smart kitchen scales to push weight readings (stock counts, waste, portions)."""
    merged = {**body.payload, "event_type": body.event_type}
    raw = await ingestion_service.ingest(body.outlet_id, IngestSourceEnum.smart_scale, merged, db)
    return {"status": "ingested", "event_id": raw.id, "processed": raw.processed}


@router.post("/jarvis")
async def ingest_jarvis(body: IngestPayload, db: AsyncSession = Depends(get_db)):
    """Called by Jarvis (Staqu video analytics) to push people/activity events."""
    merged = {**body.payload, "event_type": body.event_type}
    raw = await ingestion_service.ingest(body.outlet_id, IngestSourceEnum.jarvis, merged, db)
    return {"status": "ingested", "event_id": raw.id, "processed": raw.processed}
