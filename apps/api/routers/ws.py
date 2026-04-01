from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.redis_service import get_redis, subscribe_outlet
import json, logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/alerts/{outlet_id}")
async def websocket_alerts(outlet_id: str, websocket: WebSocket):
    await websocket.accept()
    logger.info(f"WebSocket connected: outlet={outlet_id}")
    try:
        redis = await get_redis()
        async for message in subscribe_outlet(redis, outlet_id):
            await websocket.send_text(message)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: outlet={outlet_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
