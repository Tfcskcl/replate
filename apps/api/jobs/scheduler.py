from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

logger = logging.getLogger(__name__)


def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    # Generate training plans nightly at 01:00
    scheduler.add_job(
        _run_training_plans,
        CronTrigger(hour=1, minute=0),
        id="training_plans",
        name="Generate training plans",
        replace_existing=True,
    )

    # Generate revenue statements on 5th of each month at 08:00
    scheduler.add_job(
        _run_revenue_statements,
        CronTrigger(day=5, hour=8, minute=0),
        id="revenue_statements",
        name="Generate monthly revenue statements",
        replace_existing=True,
    )

    # Compute heatmap snapshots every hour
    scheduler.add_job(
        _run_heatmaps,
        CronTrigger(minute=0),
        id="heatmap_snapshots",
        name="Compute hourly heatmaps",
        replace_existing=True,
    )

    # Run layout recommendation engine daily at 03:00
    scheduler.add_job(
        _run_recommendations,
        CronTrigger(hour=3, minute=0),
        id="layout_recommendations",
        name="Run layout recommendation engine",
        replace_existing=True,
    )

    # Mark offline devices every 10 minutes
    scheduler.add_job(
        _check_device_health,
        CronTrigger(minute="*/10"),
        id="device_health",
        name="Check device health",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with 5 jobs")
    return scheduler


async def _run_training_plans():
    try:
        from jobs.generate_training_plans import run_training_plan_job
        await run_training_plan_job()
    except Exception as e:
        logger.error(f"Training plan job error: {e}")


async def _run_revenue_statements():
    try:
        from services.revenue_service import run_monthly_statements
        await run_monthly_statements()
    except Exception as e:
        logger.error(f"Revenue statement job error: {e}")


async def _run_heatmaps():
    try:
        from services.location_engine import run_all_outlets
        from database import AsyncSessionLocal, Outlet
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Outlet).where(Outlet.is_active == True))
            outlets = result.scalars().all()
            from services.location_engine import compute_hourly_heatmap
            for outlet in outlets:
                try:
                    await compute_hourly_heatmap(outlet.id, db)
                except Exception as e:
                    logger.error(f"Heatmap computation failed for {outlet.id}: {e}")
    except Exception as e:
        logger.error(f"Heatmap job error: {e}")


async def _run_recommendations():
    try:
        from services.location_engine import run_all_outlets
        await run_all_outlets()
    except Exception as e:
        logger.error(f"Recommendation engine job error: {e}")


async def _check_device_health():
    try:
        from database import AsyncSessionLocal, EdgeDevice
        from sqlalchemy import select, update
        from datetime import datetime, timedelta

        cutoff = datetime.utcnow() - timedelta(minutes=5)
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(EdgeDevice)
                .where(EdgeDevice.last_heartbeat < cutoff)
                .values(is_online=False)
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Device health check error: {e}")
