from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import uuid

from database import get_db, PartnerRevenueStatement, Partner
from middleware.auth import require_roles
from services.revenue_service import generate_monthly_statement

router = APIRouter()


class MarkPaidPayload(BaseModel):
    utr_number: str
    paid_at: Optional[datetime] = None


@router.get("/partner/{partner_id}/statements")
async def get_partner_statements(
    partner_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "partner"]))
):
    result = await db.execute(
        select(PartnerRevenueStatement)
        .where(PartnerRevenueStatement.partner_id == partner_id)
        .order_by(PartnerRevenueStatement.year.desc(), PartnerRevenueStatement.month.desc())
    )
    return result.scalars().all()


@router.get("/partner/{partner_id}/statements/{year}/{month}")
async def get_statement(
    partner_id: str,
    year: int,
    month: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team", "partner"]))
):
    result = await db.execute(
        select(PartnerRevenueStatement).where(
            and_(
                PartnerRevenueStatement.partner_id == partner_id,
                PartnerRevenueStatement.year == year,
                PartnerRevenueStatement.month == month,
            )
        )
    )
    stmt = result.scalar_one_or_none()
    if not stmt:
        # Generate on demand
        stmt = await generate_monthly_statement(partner_id, month, year, db)
    return stmt


@router.post("/partner/{partner_id}/statements/{year}/{month}/generate")
async def generate_statement(
    partner_id: str,
    year: int,
    month: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    stmt = await generate_monthly_statement(partner_id, month, year, db)
    return stmt


@router.patch("/statements/{statement_id}/mark-paid")
async def mark_paid(
    statement_id: str,
    payload: MarkPaidPayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    await db.execute(
        update(PartnerRevenueStatement)
        .where(PartnerRevenueStatement.id == statement_id)
        .values(
            payment_status="paid",
            paid_at=payload.paid_at or datetime.utcnow(),
            utr_number=payload.utr_number,
        )
    )
    await db.commit()
    return {"status": "marked_paid", "utr_number": payload.utr_number}


@router.get("/summary")
async def revenue_summary(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["super_admin", "replate_team"]))
):
    """Overall revenue summary across all partners."""
    today = date.today()
    month = str(today.month).zfill(2)
    year = today.year

    result = await db.execute(
        select(PartnerRevenueStatement).where(
            and_(
                PartnerRevenueStatement.month == month,
                PartnerRevenueStatement.year == year,
            )
        )
    )
    stmts = result.scalars().all()

    total_billing   = sum(s.total_billing for s in stmts)
    total_partner   = sum(s.partner_share for s in stmts)
    total_replate   = sum(s.replate_share for s in stmts)
    pending_payment = sum(s.partner_share for s in stmts if s.payment_status == "pending")

    return {
        "month": f"{month}/{year}",
        "total_billing_inr": total_billing,
        "total_partner_share_inr": total_partner,
        "total_replate_share_inr": total_replate,
        "pending_payment_inr": pending_payment,
        "partner_count": len(stmts),
    }
