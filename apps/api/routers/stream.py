from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from fastapi import Depends
import asyncio
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory frame buffer per outlet (last N frames)
_frame_buffers: dict[str, list] = {}
MAX_BUFFER = 10


@router.post("/frame")
async def ingest_frame(
    request: Request,
    background_tasks: BackgroundTasks,
    source_type: str = "pov",
    ts: int = 0,
):
    """
    Receive a JPEG frame from an edge device.
    Header: X-Outlet-ID, X-Device-ID
    Body: raw JPEG bytes
    """
    outlet_id = request.headers.get("X-Outlet-ID", "")
    device_id = request.headers.get("X-Device-ID", "")
    source_id = request.headers.get("X-Camera-ID", device_id)

    if not outlet_id:
        raise HTTPException(400, "X-Outlet-ID header required")

    frame_bytes = await request.body()
    if not frame_bytes:
        raise HTTPException(400, "Empty frame body")

    # Buffer the frame
    buffer = _frame_buffers.setdefault(outlet_id, [])
    buffer.append({
        "bytes": frame_bytes,
        "timestamp_ms": ts,
        "source_id": source_id,
        "source_type": source_type,
    })
    if len(buffer) > MAX_BUFFER:
        buffer.pop(0)

    # Run inference in background
    background_tasks.add_task(
        run_frame_inference, outlet_id, frame_bytes, source_id, source_type, ts
    )

    return {"status": "received", "outlet_id": outlet_id, "ts": ts}


async def run_frame_inference(
    outlet_id: str,
    frame_bytes: bytes,
    source_id: str,
    source_type: str,
    timestamp_ms: int,
):
    """Background inference for a single frame."""
    try:
        from packages.vision.inference_pipeline import PersonDetector, assign_zone
        import httpx, os

        # Detect people
        detector = PersonDetector()
        people = detector.detect(frame_bytes)

        # Get zones from API (cached)
        # In production this would be cached in Redis
        # For now we skip zone assignment here and let the full pipeline handle it
        logger.debug(f"Frame processed: outlet={outlet_id}, people={len(people)}, source={source_type}")

    except Exception as e:
        logger.debug(f"Frame inference skipped: {e}")


@router.get("/buffer/{outlet_id}")
async def get_frame_buffer(outlet_id: str):
    """Get latest buffered frames for an outlet (for debugging)."""
    buffer = _frame_buffers.get(outlet_id, [])
    return {
        "outlet_id": outlet_id,
        "frame_count": len(buffer),
        "latest_ts": buffer[-1]["timestamp_ms"] if buffer else None,
    }


@router.get("/live/{outlet_id}/thumbnail")
async def get_latest_thumbnail(outlet_id: str):
    """Return latest frame as JPEG for dashboard live preview."""
    from fastapi.responses import Response

    buffer = _frame_buffers.get(outlet_id, [])
    if not buffer:
        raise HTTPException(404, "No frames available")

    latest = buffer[-1]
    return Response(content=latest["bytes"], media_type="image/jpeg")


# WebSocket route stub (main ws router is in compliance.py)
router_ws = APIRouter()
