from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, date
from calendar import monthrange
import uuid
import logging

from database import AsyncSessionLocal, Partner, Restaurant, Outlet, PartnerRevenueStatement

logger = logging.getLogger(__name__)

PLAN_MONTHLY_PRICE = {"starter": 3000, "pro": 6500, "enterprise": 12000}
PARTNER_SHARE_PERCENT = 0.60
REPLATE_SHARE_PERCENT = 0.40


async def generate_monthly_statement(partner_id: str, month: str, year: int, db: AsyncSession) -> PartnerRevenueStatement:
    """
    Generate revenue statement for a partner for a given month/year.
    month = "01" through "12"
    """
    # Load partner's restaurants and outlets
    restaurants_result = await db.execute(
        select(Restaurant).where(Restaurant.partner_id == partner_id)
    )
    restaurants = restaurants_result.scalars().all()
    restaurant_ids = [r.id for r in restaurants]

    if not restaurant_ids:
        return _empty_statement(partner_id, month, year)

    outlets_result = await db.execute(
        select(Outlet).where(
            and_(
                Outlet.restaurant_id.in_(restaurant_ids),
                Outlet.is_active == True,
            )
        )
    )
    outlets = outlets_result.scalars().all()

    line_items = []
    total_billing = 0.0

    for outlet in outlets:
        monthly_price = PLAN_MONTHLY_PRICE.get(outlet.plan, 0)
        if monthly_price == 0:
            continue

        partner_amount = monthly_price * PARTNER_SHARE_PERCENT

        line_items.append({
            "outlet_id": outlet.id,
            "outlet_name": outlet.name,
            "restaurant_name": next((r.name for r in restaurants if r.id == outlet.restaurant_id), ""),
            "plan": outlet.plan,
            "billing_amount": monthly_price,
            "partner_amount": partner_amount,
            "replate_amount": monthly_price * REPLATE_SHARE_PERCENT,
        })
        total_billing += monthly_price

    partner_share = total_billing * PARTNER_SHARE_PERCENT
    replate_share = total_billing * REPLATE_SHARE_PERCENT

    # Check if statement already exists
    existing = await db.execute(
        select(PartnerRevenueStatement).where(
            and_(
                PartnerRevenueStatement.partner_id == partner_id,
                PartnerRevenueStatement.month == month,
                PartnerRevenueStatement.year == year,
            )
        )
    )
    existing_stmt = existing.scalar_one_or_none()

    if existing_stmt:
        # Update existing
        existing_stmt.total_billing = total_billing
        existing_stmt.partner_share = partner_share
        existing_stmt.replate_share = replate_share
        existing_stmt.line_items = line_items
        await db.commit()
        return existing_stmt

    # Create new
    stmt = PartnerRevenueStatement(
        id=str(uuid.uuid4()),
        partner_id=partner_id,
        month=month,
        year=year,
        total_billing=total_billing,
        partner_share=partner_share,
        replate_share=replate_share,
        payment_status="pending",
        line_items=line_items,
    )
    db.add(stmt)
    await db.commit()
    await db.refresh(stmt)

    logger.info(
        f"Statement generated: Partner {partner_id}, {month}/{year}, "
        f"billing ₹{total_billing:,.0f}, partner share ₹{partner_share:,.0f}"
    )
    return stmt


def _empty_statement(partner_id: str, month: str, year: int) -> PartnerRevenueStatement:
    return PartnerRevenueStatement(
        id=str(uuid.uuid4()),
        partner_id=partner_id,
        month=month,
        year=year,
        total_billing=0,
        partner_share=0,
        replate_share=0,
        payment_status="pending",
        line_items=[],
    )


async def run_monthly_statements():
    """Run on the 5th of each month for the previous month."""
    today = date.today()
    if today.month == 1:
        month = "12"
        year = today.year - 1
    else:
        month = str(today.month - 1).zfill(2)
        year = today.year

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Partner).where(Partner.status == "active")
        )
        partners = result.scalars().all()

        for partner in partners:
            try:
                stmt = await generate_monthly_statement(partner.id, month, year, db)
                logger.info(f"Statement ready for {partner.name}: ₹{stmt.partner_share:,.0f}")
            except Exception as e:
                logger.error(f"Failed to generate statement for partner {partner.id}: {e}")
