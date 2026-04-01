#!/usr/bin/env python3
"""
Re-plate Edge Device
Runs on Raspberry Pi Zero 2W.
Handles: SOP recording, stream ingestion, lightweight inference, heartbeat.
"""

import asyncio
import cv2
import hashlib
import httpx
import logging
import os
import time
import json
import yaml
import psutil
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("/var/log/replate-edge.log"),
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger("replate-edge")

# ── Config ────────────────────────────────────────────────────────────────

def load_config() -> dict:
    config_path = Path("/etc/replate/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f)
    return {
        "outlet_id": os.getenv("REPLATE_OUTLET_ID", ""),
        "device_id": os.getenv("REPLATE_DEVICE_ID", ""),
        "api_url": os.getenv("REPLATE_API_URL", "https://api.re-plate.in"),
        "api_key": os.getenv("REPLATE_API_KEY", ""),
        "camera_source": os.getenv("CAMERA_SOURCE", "usb"),  # usb | rtsp | rtmp
        "usb_device": int(os.getenv("USB_DEVICE", "0")),
        "rtsp_url": os.getenv("CCTV_RTSP_URL", ""),
        "pov_fps": int(os.getenv("POV_FPS", "3")),
        "heartbeat_interval": 60,
    }


CONFIG = load_config()
API_URL = CONFIG["api_url"]
API_KEY = CONFIG["api_key"]
OUTLET_ID = CONFIG["outlet_id"]
DEVICE_ID = CONFIG["device_id"]

HTTP_HEADERS = {
    "X-Device-ID": DEVICE_ID,
    "X-API-Key": API_KEY,
    "X-Outlet-ID": OUTLET_ID,
}


# ── Heartbeat ─────────────────────────────────────────────────────────────

async def send_heartbeat():
    """POST heartbeat every 60 seconds."""
    while True:
        try:
            disk = psutil.disk_usage("/")
            cpu_temp = None
            try:
                with open("/sys/class/thermal/thermal_zone0/temp") as f:
                    cpu_temp = int(f.read().strip()) / 1000
            except Exception:
                pass

            payload = {
                "device_id": DEVICE_ID,
                "outlet_id": OUTLET_ID,
                "is_online": True,
                "disk_usage_percent": round(disk.percent, 1),
                "cpu_temp_celsius": cpu_temp,
                "firmware_version": "1.0.0",
                "timestamp": datetime.utcnow().isoformat(),
            }

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{API_URL}/api/devices/{DEVICE_ID}/heartbeat",
                    json=payload,
                    headers=HTTP_HEADERS,
                )
                if resp.status_code == 200:
                    logger.debug("Heartbeat sent OK")
                else:
                    logger.warning(f"Heartbeat failed: {resp.status_code}")

        except Exception as e:
            logger.error(f"Heartbeat error: {e}")

        await asyncio.sleep(CONFIG.get("heartbeat_interval", 60))


# ── SOP Recording ─────────────────────────────────────────────────────────

async def record_sop_session(sop_id: str, duration_minutes: int = 30):
    """
    Record a SOP session from the POV camera.
    Saves to local disk, then uploads to cloud.
    """
    source = _get_camera_source()
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        logger.error(f"Cannot open camera source: {source}")
        return

    # Video writer
    output_path = f"/tmp/sop_{sop_id}_{int(time.time())}.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    fps = 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    logger.info(f"SOP recording started: {sop_id}, {duration_minutes} min, {w}x{h}@{fps}fps")
    start_time = time.time()
    end_time = start_time + (duration_minutes * 60)

    try:
        while time.time() < end_time:
            ret, frame = cap.read()
            if not ret:
                logger.warning("Frame read failed during SOP recording")
                break
            out.write(frame)

    finally:
        cap.release()
        out.release()

    logger.info(f"SOP recording complete: {output_path}")

    # Compute fingerprint
    fingerprint = _compute_file_fingerprint(output_path)
    logger.info(f"Video fingerprint: {fingerprint}")

    # Upload to API
    await _upload_sop_video(sop_id, output_path, fingerprint)


def _compute_file_fingerprint(path: str) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


async def _upload_sop_video(sop_id: str, video_path: str, fingerprint: str):
    """Upload video file to the API."""
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            with open(video_path, "rb") as f:
                resp = await client.post(
                    f"{API_URL}/api/sops/{sop_id}/upload-video",
                    headers=HTTP_HEADERS,
                    files={"file": ("recording.mp4", f, "video/mp4")},
                )
        if resp.status_code == 200:
            logger.info(f"Video uploaded successfully for SOP {sop_id}")
            os.remove(video_path)
        else:
            logger.error(f"Video upload failed: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.error(f"Upload error: {e}")


# ── Live stream forwarding ────────────────────────────────────────────────

async def stream_pov_frames():
    """
    Continuously capture frames from POV camera and send to cloud inference.
    Frame rate: 3 fps (configurable).
    """
    source = _get_camera_source()
    interval = 1.0 / CONFIG.get("pov_fps", 3)
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    logger.info(f"Starting POV stream: {source} @ {CONFIG.get('pov_fps', 3)}fps")

    retry_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            retry_count += 1
            if retry_count > 5:
                logger.warning("Reconnecting to camera...")
                cap.release()
                await asyncio.sleep(3)
                cap = cv2.VideoCapture(source)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                retry_count = 0
            continue

        retry_count = 0

        # Encode and send to API stream endpoint
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        frame_bytes = buffer.tobytes()

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{API_URL}/api/stream/frame",
                    headers={**HTTP_HEADERS, "Content-Type": "image/jpeg"},
                    content=frame_bytes,
                    params={"source_type": "pov", "ts": int(time.time() * 1000)},
                )
        except Exception as e:
            logger.debug(f"Frame send failed: {e}")

        await asyncio.sleep(interval)


def _get_camera_source():
    """Return appropriate camera source based on config."""
    cam_type = CONFIG.get("camera_source", "usb")
    if cam_type == "usb":
        return CONFIG.get("usb_device", 0)
    elif cam_type == "rtsp":
        return CONFIG.get("rtsp_url", "")
    elif cam_type == "rtmp":
        return CONFIG.get("rtmp_url", "rtmp://localhost:1935/live/dji")
    return 0


# ── Command listener ──────────────────────────────────────────────────────

async def poll_commands():
    """Poll API for commands (start recording, restart stream, update config)."""
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{API_URL}/api/devices/{DEVICE_ID}/commands",
                    headers=HTTP_HEADERS,
                )
                if resp.status_code == 200:
                    commands = resp.json().get("commands", [])
                    for cmd in commands:
                        await handle_command(cmd)
        except Exception:
            pass
        await asyncio.sleep(30)


async def handle_command(cmd: dict):
    action = cmd.get("action")
    if action == "start_sop_recording":
        asyncio.create_task(record_sop_session(cmd["sop_id"], cmd.get("duration_minutes", 30)))
    elif action == "restart_stream":
        logger.info("Restart stream command received — restarting in 5s")
        await asyncio.sleep(5)
    elif action == "update_config":
        logger.info("Config update command received")


# ── Main ──────────────────────────────────────────────────────────────────

async def main():
    if not OUTLET_ID or not DEVICE_ID:
        logger.error("REPLATE_OUTLET_ID and REPLATE_DEVICE_ID must be set. Check /etc/replate/config.yaml")
        return

    logger.info(f"Re-plate edge device starting. Outlet: {OUTLET_ID}, Device: {DEVICE_ID}")

    await asyncio.gather(
        send_heartbeat(),
        stream_pov_frames(),
        poll_commands(),
    )


if __name__ == "__main__":
    asyncio.run(main())
