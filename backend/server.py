from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import logging
import uuid
import bcrypt
import jwt

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"

app = FastAPI(title="RE-PLATE API", version="0.1.0")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("replate")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str = "") -> str:
    u = uuid.uuid4().hex[:12]
    return f"{prefix}{u}" if prefix else u


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(uid: str, email: str) -> str:
    payload = {"sub": uid, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def create_refresh_token(uid: str) -> str:
    payload = {"sub": uid, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        ah = request.headers.get("Authorization", "")
        if ah.startswith("Bearer "):
            token = ah[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password_hash", None)
    return user


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginIn(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["OWNER", "ADMIN", "MANAGER", "STORE_MANAGER", "OPERATOR"] = "OPERATOR"
    outlet_id: Optional[str] = None


class OutletCreate(BaseModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = ""
    city: Optional[str] = ""
    zones: List[str] = Field(default_factory=lambda: ["Storage", "Kitchen", "Receiving"])


class ProductCreate(BaseModel):
    name: str
    category: str
    unit: str = "KG"
    base_unit: str = "KG"
    opening_stock: float = 0.0
    current_stock: Optional[float] = None
    minimum_stock: float = 0.0
    cost_per_unit: float = 0.0
    active: bool = True
    outlet_id: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    base_unit: Optional[str] = None
    minimum_stock: Optional[float] = None
    cost_per_unit: Optional[float] = None
    active: Optional[bool] = None


class MovementCreate(BaseModel):
    outlet_id: str
    product_id: str
    quantity: float
    movement_type: Literal["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "WASTE", "TRANSFER_IN", "TRANSFER_OUT"]
    source: str = "MANUAL"
    device_id: Optional[str] = None
    reference: Optional[str] = None
    note: Optional[str] = None


class DeviceCreate(BaseModel):
    name: str
    type: Literal["SCALE", "CAMERA", "ANDROID_EDGE"]
    outlet_id: str
    code: Optional[str] = None
    firmware: Optional[str] = "1.0.0"
    status: Literal["ACTIVE", "INACTIVE", "FUTURE"] = "ACTIVE"


class ScaleEventIn(BaseModel):
    local_event_id: str
    device_id: str
    outlet_id: str
    product_id: str
    weight: float
    unit: str = "KG"
    movement_type: Literal["STOCK_IN", "STOCK_OUT", "WASTE", "ADJUSTMENT"] = "STOCK_OUT"
    stability_status: str = "STABLE"
    source: str = "BLUETOOTH_SCALE"
    operator: Optional[str] = None
    timestamp: Optional[str] = None


class CameraEventIn(BaseModel):
    camera_id: str
    outlet_id: str
    event_type: Literal["STOCK_IN", "STOCK_OUT", "MOVEMENT", "PERSON_ENTRY", "PERSON_EXIT", "PRODUCT_DETECTED"]
    product_id: Optional[str] = None
    person_id: Optional[str] = None
    zone_id: Optional[str] = None
    confidence: float = 0.0
    timestamp: Optional[str] = None


class SalesEventIn(BaseModel):
    outlet_id: str
    product_id: str
    quantity: float
    source: str = "POS"
    external_reference: Optional[str] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Inventory ledger engine
# ---------------------------------------------------------------------------
IN_TYPES = {"STOCK_IN", "TRANSFER_IN"}
OUT_TYPES = {"STOCK_OUT", "WASTE", "TRANSFER_OUT"}


def signed_delta(movement_type: str, quantity: float) -> float:
    if movement_type in IN_TYPES:
        return abs(quantity)
    if movement_type in OUT_TYPES:
        return -abs(quantity)
    return quantity  # ADJUSTMENT keeps sign


async def record_movement(*, outlet_id, product_id, quantity, movement_type, source,
                          device_id=None, user=None, reference=None, note=None,
                          weighing_event_id=None, timestamp=None) -> dict:
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    delta = signed_delta(movement_type, quantity)
    prev_stock = float(product.get("current_stock", 0.0))
    new_stock = round(prev_stock + delta, 3)
    cost = float(product.get("cost_per_unit", 0.0))
    financial_impact = round(abs(quantity) * cost, 2)

    mv = {
        "id": new_id("MOV_"),
        "event_id": new_id("EVT_"),
        "outlet_id": outlet_id,
        "product_id": product_id,
        "product_name": product.get("name"),
        "quantity": round(abs(quantity), 3) if movement_type != "ADJUSTMENT" else round(quantity, 3),
        "delta": delta,
        "unit": product.get("unit", "KG"),
        "movement_type": movement_type,
        "source": source,
        "device_id": device_id,
        "user_id": (user or {}).get("id") if user else None,
        "user_name": (user or {}).get("name") if user else None,
        "reference": reference,
        "note": note,
        "weighing_event_id": weighing_event_id,
        "cost_per_unit": cost,
        "financial_impact": financial_impact,
        "stock_before": prev_stock,
        "stock_after": new_stock,
        "timestamp": timestamp or now_iso(),
        "created_at": now_iso(),
    }
    await db.inventory_movements.insert_one({**mv})
    await db.products.update_one({"id": product_id}, {"$set": {"current_stock": new_stock, "updated_at": now_iso()}})
    mv.pop("_id", None)
    return mv


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], user["email"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": user, "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response, _=Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"])
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"access_token": access}


# ---------------------------------------------------------------------------
# Organisation / Outlets / Users
# ---------------------------------------------------------------------------
@api.get("/organisation")
async def get_organisation(user=Depends(get_current_user)):
    org = await db.organisations.find_one({}, {"_id": 0})
    return org or {}


@api.get("/outlets")
async def list_outlets(user=Depends(get_current_user)):
    outlets = await db.outlets.find({}, {"_id": 0}).to_list(200)
    return outlets


@api.post("/outlets")
async def create_outlet(body: OutletCreate, user=Depends(get_current_user)):
    org = await db.organisations.find_one({}, {"_id": 0})
    doc = {
        "id": new_id("OUTLET_"),
        "code": body.code or f"OUTLET_{new_id()[:4].upper()}",
        "name": body.name,
        "address": body.address,
        "city": body.city,
        "organisation_id": org["id"] if org else None,
        "zones": body.zones,
        "created_at": now_iso(),
    }
    await db.outlets.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api.get("/users")
async def list_users(user=Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@api.post("/users")
async def create_user(body: UserCreate, user=Depends(get_current_user)):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id("USER_"),
        "name": body.name,
        "email": email,
        "role": body.role,
        "outlet_id": body.outlet_id,
        "password_hash": hash_password(body.password),
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one({**doc})
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@api.get("/products")
async def list_products(user=Depends(get_current_user), outlet_id: Optional[str] = None,
                        active: Optional[bool] = None):
    q = {}
    if outlet_id:
        q["outlet_id"] = outlet_id
    if active is not None:
        q["active"] = active
    products = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(1000)
    return products


@api.post("/products")
async def create_product(body: ProductCreate, user=Depends(get_current_user)):
    current = body.current_stock if body.current_stock is not None else body.opening_stock
    doc = {
        "id": new_id("SKU_"),
        "name": body.name,
        "category": body.category,
        "unit": body.unit,
        "base_unit": body.base_unit,
        "opening_stock": body.opening_stock,
        "current_stock": round(current, 3),
        "minimum_stock": body.minimum_stock,
        "cost_per_unit": body.cost_per_unit,
        "active": body.active,
        "outlet_id": body.outlet_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.products.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = now_iso()
    res = await db.products.update_one({"id": product_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return await db.products.find_one({"id": product_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Inventory (current stock + valuation)
# ---------------------------------------------------------------------------
@api.get("/inventory")
async def get_inventory(user=Depends(get_current_user), outlet_id: Optional[str] = None):
    q = {"active": True}
    if outlet_id:
        q["outlet_id"] = outlet_id
    products = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(1000)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    for p in products:
        moves_today = await db.inventory_movements.find(
            {"product_id": p["id"], "timestamp": {"$gte": today}}, {"_id": 0}
        ).to_list(1000)
        today_delta = round(sum(m.get("delta", 0.0) for m in moves_today), 3)
        stock = float(p.get("current_stock", 0.0))
        rows.append({
            **p,
            "stock_value": round(stock * float(p.get("cost_per_unit", 0.0)), 2),
            "today_movement": today_delta,
            "low_stock": stock < float(p.get("minimum_stock", 0.0)),
        })
    return rows


# ---------------------------------------------------------------------------
# Inventory movements ledger
# ---------------------------------------------------------------------------
@api.get("/inventory/movements")
async def list_movements(user=Depends(get_current_user),
                         outlet_id: Optional[str] = None,
                         product_id: Optional[str] = None,
                         movement_type: Optional[str] = None,
                         source: Optional[str] = None,
                         device_id: Optional[str] = None,
                         date_from: Optional[str] = None,
                         date_to: Optional[str] = None,
                         limit: int = 200):
    q = {}
    if outlet_id:
        q["outlet_id"] = outlet_id
    if product_id:
        q["product_id"] = product_id
    if movement_type:
        q["movement_type"] = movement_type
    if source:
        q["source"] = source
    if device_id:
        q["device_id"] = device_id
    if date_from or date_to:
        ts = {}
        if date_from:
            ts["$gte"] = date_from
        if date_to:
            ts["$lte"] = date_to + "T23:59:59Z"
        q["timestamp"] = ts
    moves = await db.inventory_movements.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return moves


@api.post("/inventory/movements")
async def create_movement(body: MovementCreate, user=Depends(get_current_user)):
    mv = await record_movement(
        outlet_id=body.outlet_id, product_id=body.product_id, quantity=body.quantity,
        movement_type=body.movement_type, source=body.source, device_id=body.device_id,
        user=user, reference=body.reference, note=body.note,
    )
    return mv


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------
@api.get("/devices")
async def list_devices(user=Depends(get_current_user), outlet_id: Optional[str] = None):
    q = {}
    if outlet_id:
        q["outlet_id"] = outlet_id
    return await db.devices.find(q, {"_id": 0}).sort("type", 1).to_list(200)


@api.post("/devices")
async def create_device(body: DeviceCreate, user=Depends(get_current_user)):
    doc = {
        "id": body.code or new_id(f"{body.type[:3].upper()}_"),
        "name": body.name,
        "type": body.type,
        "outlet_id": body.outlet_id,
        "status": body.status,
        "connection_status": "ONLINE" if body.status == "ACTIVE" else "OFFLINE",
        "firmware": body.firmware,
        "last_seen": now_iso() if body.status == "ACTIVE" else None,
        "created_at": now_iso(),
    }
    await db.devices.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api.post("/devices/{device_id}/heartbeat")
async def device_heartbeat(device_id: str, user=Depends(get_current_user)):
    await db.devices.update_one({"id": device_id},
                                {"$set": {"last_seen": now_iso(), "connection_status": "ONLINE"}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Scale / Weighing events  (idempotent by local_event_id)
# ---------------------------------------------------------------------------
@api.get("/scale-events")
async def list_scale_events(user=Depends(get_current_user), outlet_id: Optional[str] = None,
                            device_id: Optional[str] = None, limit: int = 100):
    q = {}
    if outlet_id:
        q["outlet_id"] = outlet_id
    if device_id:
        q["device_id"] = device_id
    return await db.weighing_events.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.post("/scale-events")
async def create_scale_event(body: ScaleEventIn, user=Depends(get_current_user)):
    # Idempotency: same local_event_id from same device = duplicate
    existing = await db.weighing_events.find_one(
        {"local_event_id": body.local_event_id, "device_id": body.device_id}, {"_id": 0})
    if existing:
        return {"weighing_event": existing, "movement_id": existing.get("movement_id"), "duplicate": True}

    product = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    ts = body.timestamp or now_iso()
    we = {
        "id": new_id("WEV_"),
        "local_event_id": body.local_event_id,
        "server_event_id": new_id("SRV_"),
        "outlet_id": body.outlet_id,
        "device_id": body.device_id,
        "product_id": body.product_id,
        "product_name": product.get("name") if product else None,
        "weight": round(body.weight, 3),
        "unit": body.unit,
        "movement_type": body.movement_type,
        "stability_status": body.stability_status,
        "source": body.source,
        "operator": body.operator or user.get("name"),
        "sync_status": "SYNCED",
        "timestamp": ts,
        "created_at": now_iso(),
    }
    mv = await record_movement(
        outlet_id=body.outlet_id, product_id=body.product_id, quantity=body.weight,
        movement_type=body.movement_type, source=body.source, device_id=body.device_id,
        user=user, reference=body.local_event_id, weighing_event_id=we["id"], timestamp=ts,
    )
    we["movement_id"] = mv["id"]
    await db.weighing_events.insert_one({**we})
    await db.devices.update_one({"id": body.device_id},
                                {"$set": {"last_seen": now_iso(), "connection_status": "ONLINE"}})
    we.pop("_id", None)
    return {"weighing_event": we, "movement": mv, "duplicate": False}


# ---------------------------------------------------------------------------
# Future-ready: camera events & sales events
# ---------------------------------------------------------------------------
@api.get("/camera-events")
async def list_camera_events(user=Depends(get_current_user), limit: int = 100):
    return await db.camera_events.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.post("/camera-events")
async def create_camera_event(body: CameraEventIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id("CEV_"),
        "camera_id": body.camera_id,
        "outlet_id": body.outlet_id,
        "event_type": body.event_type,
        "product_id": body.product_id,
        "person_id": body.person_id,
        "zone_id": body.zone_id,
        "confidence": body.confidence,
        "correlated_weighing_event_id": None,
        "timestamp": body.timestamp or now_iso(),
        "created_at": now_iso(),
    }
    await db.camera_events.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@api.get("/sales-events")
async def list_sales_events(user=Depends(get_current_user), limit: int = 100):
    return await db.sales_events.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.post("/sales-events")
async def create_sales_event(body: SalesEventIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id("SEV_"),
        "outlet_id": body.outlet_id,
        "product_id": body.product_id,
        "quantity": body.quantity,
        "source": body.source,
        "external_reference": body.external_reference,
        "timestamp": body.timestamp or now_iso(),
        "created_at": now_iso(),
    }
    await db.sales_events.insert_one({**doc})
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard/summary")
async def dashboard_summary(user=Depends(get_current_user), outlet_id: Optional[str] = None):
    pq = {"active": True}
    if outlet_id:
        pq["outlet_id"] = outlet_id
    products = await db.products.find(pq, {"_id": 0}).to_list(1000)
    total_value = round(sum(float(p.get("current_stock", 0)) * float(p.get("cost_per_unit", 0)) for p in products), 2)
    low_stock = [p for p in products if float(p.get("current_stock", 0)) < float(p.get("minimum_stock", 0))]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mq = {"timestamp": {"$gte": today}}
    if outlet_id:
        mq["outlet_id"] = outlet_id
    moves_today = await db.inventory_movements.find(mq, {"_id": 0}).to_list(2000)

    def sum_val(types):
        return round(sum(m.get("financial_impact", 0) for m in moves_today if m.get("movement_type") in types), 2)

    stock_in_val = sum_val(IN_TYPES)
    stock_out_val = sum_val({"STOCK_OUT", "TRANSFER_OUT"})
    waste_val = sum_val({"WASTE"})

    rq = {}
    if outlet_id:
        rq["outlet_id"] = outlet_id
    recent_moves = await db.inventory_movements.find(rq, {"_id": 0}).sort("timestamp", -1).to_list(8)
    recent_weighings = await db.weighing_events.find(rq, {"_id": 0}).sort("timestamp", -1).to_list(6)
    devices = await db.devices.find(rq, {"_id": 0}).to_list(50)
    online = len([d for d in devices if d.get("connection_status") == "ONLINE"])

    return {
        "total_inventory_value": total_value,
        "today_stock_in": stock_in_val,
        "today_stock_out": stock_out_val,
        "today_waste": waste_val,
        "low_stock_count": len(low_stock),
        "product_count": len(products),
        "device_online": online,
        "device_total": len(devices),
        "low_stock": low_stock[:6],
        "recent_movements": recent_moves,
        "recent_weighings": recent_weighings,
        "devices": devices,
    }


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
async def seed():
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    admin_password = os.environ["ADMIN_PASSWORD"]

    org = await db.organisations.find_one({})
    if not org:
        org_id = new_id("ORG_")
        await db.organisations.insert_one({
            "id": org_id, "name": "Re-Plate Demo Organisation",
            "currency": "INR", "created_at": now_iso(),
        })
    else:
        org_id = org["id"]

    # Outlets
    if await db.outlets.count_documents({}) == 0:
        outlets = [
            {"id": "OUTLET_001", "code": "OUTLET_001", "name": "One N Only, Anand",
             "city": "Anand, Gujarat", "address": "Station Road, Anand", "organisation_id": org_id,
             "zones": ["Storage", "Kitchen", "Receiving"], "created_at": now_iso()},
            {"id": "OUTLET_002", "code": "OUTLET_002", "name": "Spice Garden",
             "city": "Vadodara, Gujarat", "address": "Alkapuri, Vadodara", "organisation_id": org_id,
             "zones": ["Storage", "Kitchen"], "created_at": now_iso()},
        ]
        await db.outlets.insert_many(outlets)

    # Admin / owner user
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id("USER_"), "name": "Amit (Owner)", "email": admin_email,
            "role": "OWNER", "outlet_id": "OUTLET_001",
            "password_hash": hash_password(admin_password), "active": True, "created_at": now_iso(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})

    # Extra demo users
    demo_users = [
        ("Priya (Manager)", "manager@re-plate.in", "MANAGER", "OUTLET_001"),
        ("Ravi (Store Manager)", "store@re-plate.in", "STORE_MANAGER", "OUTLET_001"),
        ("Suresh (Operator)", "operator@re-plate.in", "OPERATOR", "OUTLET_001"),
    ]
    for name, email, role, outlet in demo_users:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": new_id("USER_"), "name": name, "email": email, "role": role,
                "outlet_id": outlet, "password_hash": hash_password("replate123"),
                "active": True, "created_at": now_iso(),
            })

    # Products
    if await db.products.count_documents({}) == 0:
        prods = [
            ("SKU_CHICKEN", "Chicken Breast", "Meat", "KG", 39.550, 20, 280),
            ("SKU_PANEER", "Paneer", "Dairy", "KG", 12.400, 8, 320),
            ("SKU_CHEESE", "Cheese", "Dairy", "KG", 6.800, 5, 420),
            ("SKU_MUTTON", "Mutton", "Meat", "KG", 15.200, 10, 650),
            ("SKU_RICE", "Rice", "Grocery", "KG", 84.000, 30, 62),
            ("SKU_OIL", "Oil", "Grocery", "Litre", 48.500, 20, 145),
        ]
        docs = []
        for pid, name, cat, unit, stock, mins, cost in prods:
            docs.append({
                "id": pid, "name": name, "category": cat, "unit": unit, "base_unit": unit,
                "opening_stock": stock, "current_stock": stock, "minimum_stock": mins,
                "cost_per_unit": cost, "active": True, "outlet_id": "OUTLET_001",
                "created_at": now_iso(), "updated_at": now_iso(),
            })
        await db.products.insert_many(docs)

    # Devices
    if await db.devices.count_documents({}) == 0:
        await db.devices.insert_many([
            {"id": "SCALE_001", "name": "iScale BT — Receiving", "type": "SCALE",
             "outlet_id": "OUTLET_001", "status": "ACTIVE", "connection_status": "ONLINE",
             "firmware": "1.2.0", "last_seen": now_iso(), "created_at": now_iso()},
            {"id": "EDGE_001", "name": "Android Edge — Kitchen", "type": "ANDROID_EDGE",
             "outlet_id": "OUTLET_001", "status": "ACTIVE", "connection_status": "ONLINE",
             "firmware": "0.1.0", "last_seen": now_iso(), "created_at": now_iso()},
            {"id": "CAM_001", "name": "AI Camera — Storage (Future)", "type": "CAMERA",
             "outlet_id": "OUTLET_001", "status": "FUTURE", "connection_status": "OFFLINE",
             "firmware": None, "last_seen": None, "created_at": now_iso()},
        ])

    # Seed movements / weighing events for today so dashboard has data
    if await db.inventory_movements.count_documents({}) == 0:
        owner = await db.users.find_one({"email": admin_email}, {"_id": 0})
        base = datetime.now(timezone.utc)
        samples = [
            ("SKU_RICE", 10.0, "STOCK_IN", "MANUAL", None, 130),
            ("SKU_PANEER", 2.1, "STOCK_OUT", "BLUETOOTH_SCALE", "SCALE_001", 60),
            ("SKU_CHICKEN", 3.25, "STOCK_OUT", "BLUETOOTH_SCALE", "SCALE_001", 40),
            ("SKU_OIL", 1.5, "STOCK_OUT", "MANUAL", None, 25),
            ("SKU_MUTTON", 0.8, "WASTE", "MANUAL", None, 15),
        ]
        for pid, qty, mtype, source, dev, mins_ago in samples:
            ts = (base - timedelta(minutes=mins_ago)).isoformat()
            mv = await record_movement(outlet_id="OUTLET_001", product_id=pid, quantity=qty,
                                       movement_type=mtype, source=source, device_id=dev,
                                       user=owner, timestamp=ts)
            if source == "BLUETOOTH_SCALE":
                await db.weighing_events.insert_one({
                    "id": new_id("WEV_"), "local_event_id": new_id("LOCAL_"),
                    "server_event_id": new_id("SRV_"), "outlet_id": "OUTLET_001",
                    "device_id": dev, "product_id": pid, "product_name": mv["product_name"],
                    "weight": qty, "unit": "KG", "movement_type": mtype,
                    "stability_status": "STABLE", "source": source,
                    "operator": "Suresh (Operator)", "sync_status": "SYNCED",
                    "movement_id": mv["id"], "timestamp": ts, "created_at": now_iso(),
                })

    logger.info("Seed complete.")


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "re-plate", "version": "0.1.0", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("id", unique=True)
    await db.weighing_events.create_index([("local_event_id", 1), ("device_id", 1)], unique=True)
    await db.inventory_movements.create_index("timestamp")
    await seed()


@app.on_event("shutdown")
async def shutdown():
    client.close()
