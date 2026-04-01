from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import uuid

from database import get_db, EdgeDevice, Outlet
from middleware.auth import require_roles

router = APIRouter()


class HeartbeatPayload(BaseModel):
    device_id: str
    outlet_id: str
    is_online: bool = True
    disk_usage_percent: float = 0.0
    cpu_temp_celsius: Optional[float] = None
    firmware_version: str = "1.0.0"
    timestamp: Optional[str] = None


class DeviceCreate(BaseModel):
    outlet_id: str
    serial_number: str
    partner_id: Optional[str] = None


class CommandResponse(BaseModel):
    commands: List[dict]


# Pending commands store (in production, use Redis or DB)
_pending_commands: dict[str, list] = {}


@router.post("/{device_id}/heartbeat")
async def receive_heartbeat(
    device_id: str,
    payload: HeartbeatPayload,
    db: AsyncSession = Depends(get_db),
):
    """Receive heartbeat from edge device. No auth required (uses X-API-Key)."""
    result = await db.execute(select(EdgeDevice).where(EdgeDevice.id == device_id))
    device = result.scalar_one_or_none()

    if not device:
        # Auto-register new device
        device = EdgeDevice(
            id=device_id,
            outlet_id=payload.outlet_id,
            serial_number=payload.device_id,
            firmware_version=payload.firmware_version,
        )
        db.add(device)
    else:
        await db.execute(
            update(EdgeDevice).where(EdgeDevice.id == device_id).values(
                is_online=True,
                last_heartbeat=datetime.utcnow(),
                disk_usage_percent=payload.disk_usage_percent,
                cpu_temp_celsius=payload.cpu_temp_celsius,
                firmware_version=payload.firmware_version,
            )
        )

    await db.commit()
    return {"status": "ok", "server_time": datetime.utcnow().isoformat()}


@router.get("/{device_id}/commands")
async def get_commands(device_id: str):
    """Poll for pending commands. Called by edge device every 30s."""
    commands = _pending_commands.pop(device_id, [])
    return {"commands": commands}


@router.post("/{device_id}/command")
async def send_command(
    device_id: str,
    command: dict,
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    """Queue a command for an edge device."""
    _pending_commands.setdefault(device_id, []).append(command)
    return {"queued": True, "command": command}


@router.post("/")
async def register_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    device = EdgeDevice(
        id=str(uuid.uuid4()),
        outlet_id=payload.outlet_id,
        serial_number=payload.serial_number,
        partner_id=payload.partner_id,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


@router.get("/outlet/{outlet_id}")
async def list_outlet_devices(
    outlet_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "restaurant_owner", "restaurant_manager", "partner"]))
):
    result = await db.execute(
        select(EdgeDevice).where(EdgeDevice.outlet_id == outlet_id)
    )
    devices = result.scalars().all()

    # Mark devices as offline if no heartbeat in 5 minutes
    cutoff = datetime.utcnow() - timedelta(minutes=5)
    out = []
    for d in devices:
        is_online = d.last_heartbeat and d.last_heartbeat > cutoff
        out.append({**d.__dict__, "is_online": is_online})

    return out


@router.get("/fleet/status")
async def fleet_status(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    """Overview of all devices across the fleet."""
    result = await db.execute(select(EdgeDevice))
    devices = result.scalars().all()
    cutoff = datetime.utcnow() - timedelta(minutes=5)

    online = sum(1 for d in devices if d.last_heartbeat and d.last_heartbeat > cutoff)
    offline = len(devices) - online

    return {
        "total": len(devices),
        "online": online,
        "offline": offline,
        "low_disk": sum(1 for d in devices if d.disk_usage_percent > 80),
        "high_temp": sum(1 for d in devices if d.cpu_temp_celsius and d.cpu_temp_celsius > 75),
    }
