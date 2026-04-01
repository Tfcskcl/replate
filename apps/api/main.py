from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from database import engine, Base
from routers import (
    auth, restaurants, outlets, staff, sops,
    compliance, training, location, cameras,
    devices, partners, revenue, stream, ws
)
from middleware.auth import ClerkAuthMiddleware
from jobs.scheduler import start_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting re-plate API...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    scheduler = start_scheduler()
    yield
    # Shutdown
    scheduler.shutdown()
    logger.info("re-plate API shut down.")


app = FastAPI(
    title="re-plate API",
    description="AI-powered kitchen intelligence platform — Hidden Flavour Pvt. Ltd.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://re-plate.in",
        "https://www.re-plate.in",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(ClerkAuthMiddleware)

# Mount all routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(restaurants.router, prefix="/api/restaurants", tags=["restaurants"])
app.include_router(outlets.router, prefix="/api/outlets", tags=["outlets"])
app.include_router(staff.router, prefix="/api/staff", tags=["staff"])
app.include_router(sops.router, prefix="/api/sops", tags=["sops"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(location.router, prefix="/api/location", tags=["location"])
app.include_router(cameras.router, prefix="/api/cameras", tags=["cameras"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(partners.router, prefix="/api/partners", tags=["partners"])
app.include_router(revenue.router, prefix="/api/revenue", tags=["revenue"])
app.include_router(stream.router, prefix="/api/stream", tags=["stream"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "re-plate-api", "version": "1.0.0"}
