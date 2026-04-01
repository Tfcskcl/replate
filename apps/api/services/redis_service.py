import redis.asyncio as aioredis
import os
import json
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_redis_client = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


async def publish_alert(redis: aioredis.Redis, outlet_id: str, payload: dict):
    """Publish compliance alert to outlet channel."""
    channel = f"alerts:{outlet_id}"
    await redis.publish(channel, json.dumps(payload))

    # Also publish to "all" channel for dashboard overview
    await redis.publish("alerts:all", json.dumps(payload))

    # Store recent alerts (last 200 per outlet)
    key = f"recent_alerts:{outlet_id}"
    await redis.lpush(key, json.dumps(payload))
    await redis.ltrim(key, 0, 199)
    await redis.expire(key, 86400 * 7)  # 7 days


async def get_recent_alerts(outlet_id: str, limit: int = 50) -> list:
    redis = await get_redis()
    key = f"recent_alerts:{outlet_id}"
    items = await redis.lrange(key, 0, limit - 1)
    return [json.loads(item) for item in items]


async def subscribe_outlet(redis: aioredis.Redis, outlet_id: str) -> AsyncGenerator[str, None]:
    """Subscribe to alert channel and yield messages."""
    channel = f"alerts:{outlet_id}" if outlet_id != "all" else "alerts:all"
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield message["data"]
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()


async def cache_set(key: str, value: dict, ttl: int = 300):
    redis = await get_redis()
    await redis.setex(key, ttl, json.dumps(value))


async def cache_get(key: str) -> dict | None:
    redis = await get_redis()
    val = await redis.get(key)
    return json.loads(val) if val else None


async def cache_delete(key: str):
    redis = await get_redis()
    await redis.delete(key)
