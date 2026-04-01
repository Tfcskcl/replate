from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import (
    String, Boolean, Float, Integer, DateTime, Text, JSON,
    ForeignKey, Enum, func, Index
)
from datetime import datetime
from typing import Optional, List
import enum
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:password@localhost:5432/replate"
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ── Enums ─────────────────────────────────────────────────────────────────

class PlanEnum(str, enum.Enum):
    starter = "starter"
    pro = "pro"
    enterprise = "enterprise"

class SeverityEnum(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"

class EventTypeEnum(str, enum.Enum):
    step_pass = "step_pass"
    step_fail = "step_fail"
    step_late = "step_late"
    step_skip = "step_skip"
    hygiene_breach = "hygiene_breach"
    ingredient_error = "ingredient_error"
    plating_deviation = "plating_deviation"
    timing_violation = "timing_violation"

class SOPStatusEnum(str, enum.Enum):
    draft = "draft"
    annotating = "annotating"
    review = "review"
    locked = "locked"

class UserRoleEnum(str, enum.Enum):
    super_admin = "super_admin"
    replate_team = "replate_team"
    partner = "partner"
    restaurant_owner = "restaurant_owner"
    restaurant_manager = "restaurant_manager"

class PartnerStatusEnum(str, enum.Enum):
    pending = "pending"
    active = "active"
    suspended = "suspended"
    terminated = "terminated"

class PartnerTierEnum(str, enum.Enum):
    explorer = "explorer"
    builder = "builder"
    elite = "elite"

class ModuleTypeEnum(str, enum.Enum):
    micro_video = "micro_video"
    checklist = "checklist"
    quiz = "quiz"
    shadow_session = "shadow_session"
    team_briefing = "team_briefing"


# ── Models ────────────────────────────────────────────────────────────────

class UserProfile(Base):
    __tablename__ = "user_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    clerk_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRoleEnum] = mapped_column(Enum(UserRoleEnum))
    partner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("partners.id"), nullable=True)
    restaurant_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("restaurants.id"), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class Partner(Base):
    __tablename__ = "partners"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    phone: Mapped[str] = mapped_column(String(20))
    city: Mapped[str] = mapped_column(String(100))
    territory_description: Mapped[str] = mapped_column(Text)
    status: Mapped[PartnerStatusEnum] = mapped_column(Enum(PartnerStatusEnum), default=PartnerStatusEnum.pending)
    tier: Mapped[PartnerTierEnum] = mapped_column(Enum(PartnerTierEnum), default=PartnerTierEnum.explorer)
    security_deposit_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    security_deposit_amount: Mapped[float] = mapped_column(Float, default=40000.0)
    agreement_start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    agreement_end_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    pan_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    gstin: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    restaurants: Mapped[List["Restaurant"]] = relationship("Restaurant", back_populates="partner")
    revenue_statements: Mapped[List["PartnerRevenueStatement"]] = relationship("PartnerRevenueStatement", back_populates="partner")


class Restaurant(Base):
    __tablename__ = "restaurants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    partner_id: Mapped[str] = mapped_column(String(36), ForeignKey("partners.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    fssai_number: Mapped[str] = mapped_column(String(50))
    cuisine_type: Mapped[str] = mapped_column(String(100))
    owner_name: Mapped[str] = mapped_column(String(255))
    owner_phone: Mapped[str] = mapped_column(String(20))
    owner_email: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    partner: Mapped["Partner"] = relationship("Partner", back_populates="restaurants")
    outlets: Mapped[List["Outlet"]] = relationship("Outlet", back_populates="restaurant")


class Outlet(Base):
    __tablename__ = "outlets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(Text)
    city: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(100))
    pincode: Mapped[str] = mapped_column(String(10))
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    plan: Mapped[PlanEnum] = mapped_column(Enum(PlanEnum), default=PlanEnum.starter)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    go_live_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="outlets")
    staff: Mapped[List["Staff"]] = relationship("Staff", back_populates="outlet")
    sop_records: Mapped[List["SOPRecord"]] = relationship("SOPRecord", back_populates="outlet")
    compliance_events: Mapped[List["ComplianceEvent"]] = relationship("ComplianceEvent", back_populates="outlet")
    cameras: Mapped[List["CameraStream"]] = relationship("CameraStream", back_populates="outlet")
    devices: Mapped[List["EdgeDevice"]] = relationship("EdgeDevice", back_populates="outlet")
    kitchen_zones: Mapped[List["KitchenZone"]] = relationship("KitchenZone", back_populates="outlet")


class Staff(Base):
    __tablename__ = "staff"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    badge_photo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    outlet: Mapped["Outlet"] = relationship("Outlet", back_populates="staff")


class Dish(Base):
    __tablename__ = "dishes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class SOPRecord(Base):
    __tablename__ = "sop_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    dish_id: Mapped[str] = mapped_column(String(36), ForeignKey("dishes.id"))
    dish_name: Mapped[str] = mapped_column(String(255))
    recorded_by: Mapped[str] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    video_url: Mapped[str] = mapped_column(String(512))
    video_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    lock_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[SOPStatusEnum] = mapped_column(Enum(SOPStatusEnum), default=SOPStatusEnum.draft)

    outlet: Mapped["Outlet"] = relationship("Outlet", back_populates="sop_records")
    steps: Mapped[List["SOPStep"]] = relationship("SOPStep", back_populates="sop", cascade="all, delete-orphan", order_by="SOPStep.step_number")

    __table_args__ = (Index("ix_sop_outlet_dish", "outlet_id", "dish_id"),)


class SOPStep(Base):
    __tablename__ = "sop_steps"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sop_id: Mapped[str] = mapped_column(String(36), ForeignKey("sop_records.id"), index=True)
    step_number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    start_timestamp_sec: Mapped[float] = mapped_column(Float)
    end_timestamp_sec: Mapped[float] = mapped_column(Float)
    allowed_duration_min_sec: Mapped[float] = mapped_column(Float)
    allowed_duration_max_sec: Mapped[float] = mapped_column(Float)
    required_ingredients: Mapped[list] = mapped_column(JSON, default=list)
    visual_checkpoint: Mapped[str] = mapped_column(Text)
    is_critical: Mapped[bool] = mapped_column(Boolean, default=True)
    can_be_skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    reference_frame_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    sop: Mapped["SOPRecord"] = relationship("SOPRecord", back_populates="steps")


class ComplianceEvent(Base):
    __tablename__ = "compliance_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    chef_id: Mapped[str] = mapped_column(String(36), ForeignKey("staff.id"), index=True)
    chef_name: Mapped[str] = mapped_column(String(255))
    dish_id: Mapped[str] = mapped_column(String(36))
    dish_name: Mapped[str] = mapped_column(String(255))
    sop_id: Mapped[str] = mapped_column(String(36))
    step_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    step_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    source: Mapped[str] = mapped_column(String(10))
    event_type: Mapped[EventTypeEnum] = mapped_column(Enum(EventTypeEnum))
    severity: Mapped[SeverityEnum] = mapped_column(Enum(SeverityEnum))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    video_clip_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    outlet: Mapped["Outlet"] = relationship("Outlet", back_populates="compliance_events")

    __table_args__ = (Index("ix_compliance_outlet_ts", "outlet_id", "timestamp"),)


class TrainingModule(Base):
    __tablename__ = "training_modules"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    chef_id: Mapped[str] = mapped_column(String(36), ForeignKey("staff.id"), index=True)
    chef_name: Mapped[str] = mapped_column(String(255))
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    module_type: Mapped[ModuleTypeEnum] = mapped_column(Enum(ModuleTypeEnum))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    source_step_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    source_clip_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    due_date: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    generated_by: Mapped[str] = mapped_column(String(10), default="auto")
    estimated_duration_min: Mapped[int] = mapped_column(Integer, default=5)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class CameraStream(Base):
    __tablename__ = "camera_streams"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    stream_type: Mapped[str] = mapped_column(String(10))
    stream_url_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    username_encrypted: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    password_encrypted: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    location: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    outlet: Mapped["Outlet"] = relationship("Outlet", back_populates="cameras")


class EdgeDevice(Base):
    __tablename__ = "edge_devices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    serial_number: Mapped[str] = mapped_column(String(100), unique=True)
    firmware_version: Mapped[str] = mapped_column(String(50), default="1.0.0")
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    disk_usage_percent: Mapped[float] = mapped_column(Float, default=0.0)
    cpu_temp_celsius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    partner_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    outlet: Mapped["Outlet"] = relationship("Outlet", back_populates="devices")


class KitchenZone(Base):
    __tablename__ = "kitchen_zones"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    camera_id: Mapped[str] = mapped_column(String(36), ForeignKey("camera_streams.id"))
    name: Mapped[str] = mapped_column(String(100))
    zone_type: Mapped[str] = mapped_column(String(50))
    polygon_points: Mapped[list] = mapped_column(JSON, default=list)
    is_hygiene_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    max_occupancy: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fssai_zone_class: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    outlet: Mapped["Outlet"] = relationship("Outlet", back_populates="kitchen_zones")


class ZoneOccupancyEvent(Base):
    __tablename__ = "zone_occupancy_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), index=True)
    camera_id: Mapped[str] = mapped_column(String(36))
    chef_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    zone_id: Mapped[str] = mapped_column(String(36))
    entered_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    exited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    __table_args__ = (Index("ix_zone_occ_outlet_ts", "outlet_id", "entered_at"),)


class ZoneTransition(Base):
    __tablename__ = "zone_transitions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), index=True)
    chef_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    from_zone_id: Mapped[str] = mapped_column(String(36))
    to_zone_id: Mapped[str] = mapped_column(String(36))
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    had_wash_basin_visit: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hygiene_breach: Mapped[bool] = mapped_column(Boolean, default=False)


class ZoneHeatmapSnapshot(Base):
    __tablename__ = "zone_heatmap_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), index=True)
    snapshot_hour: Mapped[datetime] = mapped_column(DateTime)
    zone_occupancy: Mapped[dict] = mapped_column(JSON, default=dict)
    peak_zone_id: Mapped[str] = mapped_column(String(36))
    total_transitions: Mapped[int] = mapped_column(Integer, default=0)
    hygiene_breach_count: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (Index("ix_heatmap_outlet_hour", "outlet_id", "snapshot_hour"),)


class LayoutRecommendation(Base):
    __tablename__ = "layout_recommendations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outlet_id: Mapped[str] = mapped_column(String(36), ForeignKey("outlets.id"), index=True)
    finding_type: Mapped[str] = mapped_column(String(100))
    severity: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(Text)
    root_cause: Mapped[str] = mapped_column(Text)
    what_data_shows: Mapped[str] = mapped_column(Text)
    estimated_impact: Mapped[str] = mapped_column(Text)
    estimated_monthly_saving_inr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fssai_risk: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fixes: Mapped[list] = mapped_column(JSON, default=list)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="open")


class PartnerRevenueStatement(Base):
    __tablename__ = "partner_revenue_statements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    partner_id: Mapped[str] = mapped_column(String(36), ForeignKey("partners.id"), index=True)
    month: Mapped[str] = mapped_column(String(7))
    year: Mapped[int] = mapped_column(Integer)
    total_billing: Mapped[float] = mapped_column(Float, default=0.0)
    partner_share: Mapped[float] = mapped_column(Float, default=0.0)
    replate_share: Mapped[float] = mapped_column(Float, default=0.0)
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    utr_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    line_items: Mapped[list] = mapped_column(JSON, default=list)

    partner: Mapped["Partner"] = relationship("Partner", back_populates="revenue_statements")
