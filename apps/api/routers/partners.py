from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
import uuid

from database import get_db, Partner, Restaurant, Outlet, PartnerRevenueStatement
from middleware.auth import require_roles

router = APIRouter()


class PartnerCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    city: str
    territory_description: str
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    territory_description: Optional[str] = None
    status: Optional[str] = None
    tier: Optional[str] = None
    security_deposit_paid: Optional[bool] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    agreement_start_date: Optional[datetime] = None
    agreement_end_date: Optional[datetime] = None


@router.get("/")
async def list_partners(
    status: Optional[str] = None,
    city: Optional[str] = None,
    tier: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    query = select(Partner)
    if status:
        query = query.where(Partner.status == status)
    if city:
        query = query.where(Partner.city == city)
    if tier:
        query = query.where(Partner.tier == tier)
    result = await db.execute(query.order_by(Partner.created_at.desc()))
    partners = result.scalars().all()

    # Enrich with client count
    out = []
    for p in partners:
        rests = await db.execute(select(Restaurant).where(Restaurant.partner_id == p.id))
        rest_ids = [r.id for r in rests.scalars().all()]
        client_count = 0
        if rest_ids:
            oc = await db.execute(
                select(func.count(Outlet.id)).where(
                    and_(Outlet.restaurant_id.in_(rest_ids), Outlet.is_active == True)
                )
            )
            client_count = oc.scalar() or 0

        out.append({**p.__dict__, "active_clients": client_count})

    return out


@router.post("/")
async def create_partner(
    payload: PartnerCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    existing = await db.execute(select(Partner).where(Partner.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Partner with this email already exists")

    partner = Partner(
        id=str(uuid.uuid4()),
        **payload.model_dump(),
        status="pending",
        tier="explorer",
        security_deposit_paid=False,
        security_deposit_amount=40000.0,
    )
    db.add(partner)
    await db.commit()
    await db.refresh(partner)
    return partner


@router.get("/me")
async def get_my_partner_profile(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["partner"]))
):
    """For partners to view their own profile."""
    result = await db.execute(select(Partner).where(Partner.id == user.get("partner_id")))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(404, "Partner profile not found")
    return partner


@router.get("/{partner_id}")
async def get_partner(
    partner_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "partner"]))
):
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(404, "Partner not found")
    return partner


@router.patch("/{partner_id}")
async def update_partner(
    partner_id: str,
    payload: PartnerUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    values = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.execute(update(Partner).where(Partner.id == partner_id).values(**values))
    await db.commit()
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    return result.scalar_one()


@router.get("/{partner_id}/clients")
async def list_partner_clients(
    partner_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "partner"]))
):
    rests = await db.execute(select(Restaurant).where(Restaurant.partner_id == partner_id))
    restaurants = rests.scalars().all()
    rest_ids = [r.id for r in restaurants]

    if not rest_ids:
        return []

    outlets = await db.execute(
        select(Outlet).where(Outlet.restaurant_id.in_(rest_ids))
    )
    outlet_list = outlets.scalars().all()

    return [
        {
            **o.__dict__,
            "restaurant_name": next((r.name for r in restaurants if r.id == o.restaurant_id), ""),
        }
        for o in outlet_list
    ]


@router.get("/{partner_id}/performance")
async def get_partner_performance(
    partner_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "partner"]))
):
    """Partner performance summary for dashboard."""
    from services.revenue_service import PLAN_MONTHLY_PRICE, PARTNER_SHARE_PERCENT

    rests = await db.execute(select(Restaurant).where(Restaurant.partner_id == partner_id))
    rest_ids = [r.id for r in rests.scalars().all()]

    active_clients = 0
    monthly_billing = 0.0

    if rest_ids:
        outlets = await db.execute(
            select(Outlet).where(
                and_(Outlet.restaurant_id.in_(rest_ids), Outlet.is_active == True)
            )
        )
        for o in outlets.scalars().all():
            active_clients += 1
            monthly_billing += PLAN_MONTHLY_PRICE.get(o.plan, 0)

    partner_monthly = monthly_billing * PARTNER_SHARE_PERCENT

    # Determine tier
    if active_clients >= 21:
        tier = "elite"
    elif active_clients >= 10:
        tier = "builder"
    else:
        tier = "explorer"

    return {
        "partner_id": partner_id,
        "active_clients": active_clients,
        "monthly_billing": monthly_billing,
        "partner_monthly_earnings": partner_monthly,
        "projected_annual": partner_monthly * 12,
        "current_tier": tier,
        "next_tier_threshold": 10 if active_clients < 10 else 21 if active_clients < 21 else None,
        "clients_to_next_tier": max(0, (10 if active_clients < 10 else 21) - active_clients),
    }
