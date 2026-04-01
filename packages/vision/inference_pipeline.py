"""
Re-plate Vision Inference Pipeline
Runs on cloud (or RPi for edge model).
Pulls frames from RTSP/USB streams and runs SOP compliance checking.
"""

import asyncio
import cv2
import numpy as np
import base64
import httpx
import logging
import time
from datetime import datetime
from typing import AsyncGenerator, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

REPLATE_API_URL = "http://localhost:8000"
OPENAI_API_KEY = ""  # Set via env


@dataclass
class Frame:
    image_bytes: bytes
    timestamp_ms: int
    source_id: str
    source_type: str  # 'pov' | 'cctv'


@dataclass
class SOPCheckerState:
    sop_id: str
    outlet_id: str
    chef_id: str
    dish_id: str
    dish_name: str
    steps: list
    current_step_index: int = 0
    step_started_at: Optional[float] = None
    completed: bool = False


# ── Frame extraction ──────────────────────────────────────────────────────

async def frame_generator(
    source: str,
    source_id: str,
    source_type: str,
    fps: int = 3
) -> AsyncGenerator[Frame, None]:
    """
    Pull frames from any source:
    - USB cam: '/dev/video0' or integer 0
    - RTSP: 'rtsp://admin:pass@192.168.1.64/Streaming/Channels/101'
    - RTMP: 'rtmp://localhost:1935/live/dji'
    """
    interval = 1.0 / fps
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    retry_count = 0
    max_retries = 3

    while True:
        ret, frame = cap.read()
        if not ret:
            retry_count += 1
            logger.warning(f"Frame read failed ({retry_count}/{max_retries}) for {source_id}")
            if retry_count >= max_retries:
                logger.error(f"Stream {source_id} dropped. Attempting reconnect...")
                cap.release()
                await asyncio.sleep(2 ** retry_count)
                cap = cv2.VideoCapture(source)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                retry_count = 0
            continue

        retry_count = 0
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        yield Frame(
            image_bytes=buffer.tobytes(),
            timestamp_ms=int(time.time() * 1000),
            source_id=source_id,
            source_type=source_type,
        )
        await asyncio.sleep(interval)

    cap.release()


# ── Zone mapping ──────────────────────────────────────────────────────────

def point_in_polygon(px: int, py: int, polygon: list) -> bool:
    """Ray casting algorithm for point-in-polygon."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def assign_zone(centroid_x: int, centroid_y: int, zones: list) -> Optional[str]:
    """Find which zone a centroid falls in."""
    for zone in zones:
        if point_in_polygon(centroid_x, centroid_y, zone["polygon_points"]):
            return zone["id"]
    return None


# ── Person detection (lightweight) ───────────────────────────────────────

class PersonDetector:
    """
    Uses HOG person detector for edge (RPi).
    Falls back to YOLOv8 when available.
    """
    def __init__(self):
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(self, frame_bytes: bytes) -> list:
        """Returns list of {centroid_x, centroid_y, bbox, confidence}"""
        nparr = np.frombuffer(frame_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        img_small = cv2.resize(img, (640, 360))

        boxes, weights = self.hog.detectMultiScale(
            img_small,
            winStride=(8, 8),
            padding=(4, 4),
            scale=1.05,
        )
        scale_x = img.shape[1] / 640
        scale_y = img.shape[0] / 360

        detections = []
        for (x, y, w, h), weight in zip(boxes, weights):
            cx = int((x + w / 2) * scale_x)
            cy = int((y + h / 2) * scale_y)
            detections.append({
                "centroid_x": cx,
                "centroid_y": cy,
                "bbox": [int(x * scale_x), int(y * scale_y), int(w * scale_x), int(h * scale_y)],
                "confidence": float(weight[0]),
            })
        return detections


# ── Action classifier (GPT-4o Vision) ────────────────────────────────────

async def classify_action(
    frame_bytes: bytes,
    sop_step: dict,
    reference_frame_url: Optional[str] = None,
) -> dict:
    """
    Uses GPT-4o Vision to classify whether the action in the frame
    matches the expected SOP step.
    """
    import os
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        # Fallback: rule-based pass for testing
        return {"matches_expected": True, "confidence": 0.5, "detected_action": "unknown", "ingredients_detected": []}

    image_b64 = base64.b64encode(frame_bytes).decode()

    prompt = f"""You are a kitchen compliance AI for a restaurant called re-plate.
    
Current SOP step: "{sop_step['name']}"
Expected action: {sop_step['visual_checkpoint']}
Required ingredients at this step: {[i['name'] for i in sop_step.get('required_ingredients', [])]}

Look at this kitchen frame and determine:
1. Is the chef performing the expected action? (yes/no)
2. What action are they actually performing?
3. Which ingredients from the required list are visible?
4. Are there any hygiene concerns visible?

Respond in JSON only:
{{"matches_expected": true/false, "confidence": 0.0-1.0, "detected_action": "...", "ingredients_detected": [], "hygiene_concern": null}}"""

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o",
                "max_tokens": 200,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "low"}},
                    ]
                }]
            }
        )
        if resp.status_code != 200:
            logger.error(f"OpenAI API Error ({resp.status_code}): {resp.text}")
            return {"matches_expected": False, "confidence": 0.0, "detected_action": f"api_error_{resp.status_code}", "ingredients_detected": []}

        content = resp.json()["choices"][0]["message"]["content"]
        import json
        try:
            # Strip markdown backticks if present
            clean_content = content.strip()
            if clean_content.startswith("```json"):
                clean_content = clean_content.replace("```json", "", 1).replace("```", "", 1).strip()
            elif clean_content.startswith("```"):
                clean_content = clean_content.replace("```", "", 1).replace("```", "", 1).strip()
            
            return json.loads(clean_content)
        except Exception as e:
            logger.error(f"Failed to parse GPT response: {e}. Content: {content}")
            return {"matches_expected": False, "confidence": 0.0, "detected_action": content[:100], "ingredients_detected": []}


# ── SOP Sequence Checker ──────────────────────────────────────────────────

class SOPSequenceChecker:
    def __init__(self, state: SOPCheckerState):
        self.state = state

    def current_step(self) -> Optional[dict]:
        if self.state.current_step_index < len(self.state.steps):
            return self.state.steps[self.state.current_step_index]
        return None

    def process_classification(self, classification: dict) -> list:
        """Returns list of compliance event dicts to emit."""
        events = []
        step = self.current_step()
        if not step:
            return events

        now = time.time()

        # Timing check
        if self.state.step_started_at:
            elapsed = now - self.state.step_started_at
            if elapsed > step["allowed_duration_max_sec"]:
                events.append({
                    "event_type": "timing_violation",
                    "severity": "warning",
                    "step_id": step["id"],
                    "step_name": step["name"],
                    "details": {
                        "elapsed_sec": round(elapsed, 1),
                        "max_allowed_sec": step["allowed_duration_max_sec"],
                    }
                })

        # Action match check
        if classification["matches_expected"] and classification["confidence"] > 0.65:
            events.append({
                "event_type": "step_pass",
                "severity": "info",
                "step_id": step["id"],
                "step_name": step["name"],
                "details": {"confidence": classification["confidence"]},
            })
            self.state.current_step_index += 1
            self.state.step_started_at = now

            if self.state.current_step_index >= len(self.state.steps):
                self.state.completed = True

        elif step["is_critical"] and not classification["matches_expected"]:
            if classification.get("hygiene_concern"):
                events.append({
                    "event_type": "hygiene_breach",
                    "severity": "critical",
                    "step_id": step["id"],
                    "step_name": step["name"],
                    "details": {"concern": classification["hygiene_concern"]},
                })
            else:
                events.append({
                    "event_type": "step_fail",
                    "severity": "warning",
                    "step_id": step["id"],
                    "step_name": step["name"],
                    "details": {
                        "detected": classification["detected_action"],
                        "expected": step["visual_checkpoint"],
                    },
                })

        return events


# ── Main pipeline orchestrator ────────────────────────────────────────────

async def run_inference_pipeline(outlet_config: dict):
    """
    Main long-running process. Call this per outlet.
    outlet_config = {
        outlet_id, cameras: [{id, stream_url, type}],
        zones: [...], active_sop_sessions: [...]
    }
    """
    outlet_id = outlet_config["outlet_id"]
    detector = PersonDetector()
    checkers: dict[str, SOPSequenceChecker] = {}

    logger.info(f"Starting inference pipeline for outlet {outlet_id}")

    # Start frame generators for each camera
    camera_tasks = []
    for cam in outlet_config.get("cameras", []):
        task = asyncio.create_task(
            _process_camera_stream(cam, outlet_id, outlet_config.get("zones", []), detector, checkers)
        )
        camera_tasks.append(task)

    await asyncio.gather(*camera_tasks)


async def _process_camera_stream(cam: dict, outlet_id: str, zones: list, detector: PersonDetector, checkers: dict):
    async for frame in frame_generator(cam["stream_url"], cam["id"], cam.get("type", "cctv")):
        try:
            # Person detection
            people = detector.detect(frame.image_bytes)

            # Zone mapping
            for person in people:
                zone_id = assign_zone(person["centroid_x"], person["centroid_y"], zones)
                if zone_id:
                    person["zone_id"] = zone_id

            # Hygiene breach check
            await _check_hygiene_transitions(people, zones, outlet_id)

            # SOP compliance (POV stream only)
            if frame.source_type == "pov" and frame.source_id in checkers:
                checker = checkers[frame.source_id]
                step = checker.current_step()
                if step:
                    classification = await classify_action(frame.image_bytes, step)
                    events = checker.process_classification(classification)
                    for event in events:
                        await _emit_event(outlet_id, checker.state, event)

        except Exception as e:
            logger.error(f"Error processing frame from {cam['id']}: {e}")


async def _check_hygiene_transitions(people: list, zones: list, outlet_id: str):
    """Detect raw_handling → ready_to_eat transitions without wash basin."""
    raw_zones = {z["id"] for z in zones if z.get("zone_type") == "raw_handling"}
    rte_zones = {z["id"] for z in zones if z.get("zone_type") == "ready_to_eat"}

    for person in people:
        zone_id = person.get("zone_id")
        prev_zone_id = person.get("prev_zone_id")

        if prev_zone_id in raw_zones and zone_id in rte_zones:
            if not person.get("visited_wash_basin"):
                await _emit_event(outlet_id, None, {
                    "event_type": "hygiene_breach",
                    "severity": "critical",
                    "step_name": "Hygiene zone transition",
                    "details": {
                        "from_zone": prev_zone_id,
                        "to_zone": zone_id,
                        "fssai_reference": "Schedule 4, Section 3.2",
                    }
                })


async def _emit_event(outlet_id: str, session_state: Optional[SOPCheckerState], event: dict):
    """POST compliance event to the API."""
    payload = {
        "outlet_id": outlet_id,
        "chef_id": session_state.chef_id if session_state else "unknown",
        "chef_name": "Unknown",
        "dish_id": session_state.dish_id if session_state else "",
        "dish_name": session_state.dish_name if session_state else "",
        "sop_id": session_state.sop_id if session_state else "",
        **event,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{REPLATE_API_URL}/api/compliance/ingest", json=payload)
    except Exception as e:
        logger.error(f"Failed to emit event: {e}")
