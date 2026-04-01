"""
Nightly job: generate personalised training plans for each chef
based on their compliance error patterns over the past 7 days.
Runs at 01:00 local time per outlet.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime, timedelta, date
import uuid
import logging

from database import AsyncSessionLocal, ComplianceEvent, TrainingModule, Staff, Outlet

logger = logging.getLogger(__name__)

SEVERITY_WEIGHT = {"critical": 3, "warning": 2, "info": 0}
PLAN_DURATION = {"micro_video": 3, "checklist": 5, "quiz": 10, "shadow_session": 60, "team_briefing": 20}

# Mapping from event_type patterns to training module type
ERROR_TO_MODULE = {
    "ingredient_error": "micro_video",
    "timing_violation": "checklist",
    "hygiene_breach": "team_briefing",
    "step_skip": "shadow_session",
    "step_fail": "micro_video",
    "plating_deviation": "micro_video",
}

MODULE_TITLES = {
    "micro_video": "Watch: How to {step_name} correctly",
    "checklist": "Practice: {step_name} timing checklist",
    "quiz": "Quiz: Check your knowledge on {step_name}",
    "shadow_session": "Shadow session: Re-cook {dish_name} under supervision",
    "team_briefing": "Team: Hygiene zone protocol briefing",
}


async def generate_training_plans_for_outlet(outlet_id: str, db: AsyncSession):
    """Generate training plans for all chefs in an outlet."""
    since = datetime.utcnow() - timedelta(days=7)

    # Load all events from the past 7 days
    result = await db.execute(
        select(ComplianceEvent).where(
            and_(
                ComplianceEvent.outlet_id == outlet_id,
                ComplianceEvent.timestamp >= since,
                ComplianceEvent.event_type != "step_pass",  # Only errors
            )
        ).order_by(ComplianceEvent.timestamp.desc())
    )
    events = result.scalars().all()

    if not events:
        logger.info(f"No errors for outlet {outlet_id} in past 7 days — no training plans needed")
        return []

    # Group by chef
    chef_errors: dict = {}
    for evt in events:
        cid = evt.chef_id
        if cid not in chef_errors:
            chef_errors[cid] = {"name": evt.chef_name, "patterns": {}}

        key = f"{evt.event_type}::{evt.step_id or ''}::{evt.dish_id}"
        if key not in chef_errors[cid]["patterns"]:
            chef_errors[cid]["patterns"][key] = {
                "event_type": evt.event_type,
                "step_id": evt.step_id,
                "step_name": evt.step_name or "Unknown step",
                "dish_name": evt.dish_name,
                "dish_id": evt.dish_id,
                "severity": evt.severity,
                "count": 0,
                "weighted_score": 0,
            }

        pattern = chef_errors[cid]["patterns"][key]
        pattern["count"] += 1
        pattern["weighted_score"] += SEVERITY_WEIGHT.get(evt.severity, 0)

    # Check for team-wide patterns (same error on same dish by 3+ chefs)
    team_patterns: dict = {}
    for cid, cd in chef_errors.items():
        for key, pat in cd["patterns"].items():
            tkey = f"{pat['event_type']}::{pat['step_id']}"
            team_patterns[tkey] = team_patterns.get(tkey, 0) + 1

    generated_modules = []
    due_date = datetime.utcnow().replace(hour=0, minute=0, second=0) + timedelta(days=3)

    # Team-wide intervention for patterns affecting 3+ chefs
    team_triggers = {k for k, v in team_patterns.items() if v >= 3}
    if team_triggers:
        for tkey in team_triggers:
            event_type = tkey.split("::")[0]
            if event_type == "hygiene_breach":
                module = TrainingModule(
                    id=str(uuid.uuid4()),
                    chef_id="team",
                    chef_name="All staff",
                    outlet_id=outlet_id,
                    module_type="team_briefing",
                    title="Team: Hygiene zone protocol — mandatory briefing",
                    description="Multiple chefs have violated hygiene zone rules this week. Mandatory team briefing required before next shift.",
                    due_date=due_date,
                    estimated_duration_min=PLAN_DURATION["team_briefing"],
                    priority=1,
                    generated_by="auto",
                )
                db.add(module)
                generated_modules.append(module)

    # Per-chef personalised plans
    for chef_id, chef_data in chef_errors.items():
        # Sort patterns by weighted_score descending
        top_patterns = sorted(
            chef_data["patterns"].values(),
            key=lambda x: x["weighted_score"],
            reverse=True
        )[:3]  # Max 3 modules per chef

        for i, pattern in enumerate(top_patterns):
            if pattern["count"] < 2:
                continue  # Only create module if error happened 2+ times

            module_type = ERROR_TO_MODULE.get(pattern["event_type"], "micro_video")
            title_template = MODULE_TITLES[module_type]
            title = title_template.format(
                step_name=pattern["step_name"],
                dish_name=pattern["dish_name"],
            )

            module = TrainingModule(
                id=str(uuid.uuid4()),
                chef_id=chef_id,
                chef_name=chef_data["name"],
                outlet_id=outlet_id,
                module_type=module_type,
                title=title,
                description=f"This module addresses {pattern['count']} instances of '{pattern['event_type']}' "
                            f"on '{pattern['step_name']}' for dish '{pattern['dish_name']}' in the past week.",
                source_step_id=pattern["step_id"],
                due_date=due_date + timedelta(days=i),
                estimated_duration_min=PLAN_DURATION[module_type],
                priority=i + 1,
                generated_by="auto",
            )
            db.add(module)
            generated_modules.append(module)

    await db.commit()
    logger.info(f"Generated {len(generated_modules)} training modules for outlet {outlet_id}")
    return generated_modules


async def run_training_plan_job():
    """Run for all active outlets."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Outlet).where(Outlet.is_active == True)
        )
        outlets = result.scalars().all()

        total = 0
        for outlet in outlets:
            try:
                modules = await generate_training_plans_for_outlet(outlet.id, db)
                total += len(modules)
            except Exception as e:
                logger.error(f"Training plan job failed for outlet {outlet.id}: {e}")

        logger.info(f"Training plan job complete. Generated {total} modules across {len(outlets)} outlets.")
