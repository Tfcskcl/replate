import hashlib, json, logging, asyncio
logger = logging.getLogger(__name__)

async def compute_lock_hash(fingerprint: str, steps: list) -> str:
    steps_json = json.dumps(steps, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256((fingerprint + steps_json).encode()).hexdigest()

async def annotate_frame_extract(sop_id: str, video_url: str):
    """Background task: extract key frames from video for annotation tool."""
    logger.info(f"Frame extraction started for SOP {sop_id}")
    await asyncio.sleep(1)  # Placeholder - real implementation uses ffmpeg
    logger.info(f"Frame extraction complete for SOP {sop_id}")
