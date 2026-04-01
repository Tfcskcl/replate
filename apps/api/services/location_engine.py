"""
Location Intelligence Engine
Analyses zone heatmap data to generate kitchen layout recommendations.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime, timedelta
from collections import defaultdict
import uuid
import logging

from database import (
    AsyncSessionLocal, KitchenZone, ZoneOccupancyEvent,
    ZoneTransition, ZoneHeatmapSnapshot, LayoutRecommendation, Outlet
)

logger = logging.getLogger(__name__)

FINDING_RULES = [
    {
        "type": "travel_waste",
        "check": lambda stats: stats.get("cold_to_prep_transitions_per_day", 0) > 30,
        "severity": "critical",
        "title": "Excessive travel between cold store and prep — {trips} trips/day",
        "root_cause": "Cold store is too far from the main prep area. Each trip adds dead time and fatigue.",
        "what_data_shows": "Staff made {trips} trips per day between cold store and prep zone. Each trip averages {avg_dist} seconds.",
        "estimated_impact": "Reduce by 60%: save ~{minutes_saved} minutes per chef per shift",
        "fixes": [
            {"cost_tier": "zero_cost", "description": "Pre-stage commonly used cold ingredients at prep station at shift start. Reduces trips by ~60%.", "implementation_time": "today", "expected_outcome": "60% reduction in cold store trips"},
            {"cost_tier": "low_cost", "description": "Add undercounter fridge at prep station for ingredients used in >5 dishes.", "implementation_time": "1 week", "cost_min": 5000, "cost_max": 12000, "expected_outcome": "80% reduction in cold store trips"},
            {"cost_tier": "structural", "description": "Relocate cold store adjacent to prep area at next refit.", "implementation_time": "next refit", "cost_min": 80000, "cost_max": 200000, "expected_outcome": "Eliminate the travel path entirely"},
        ]
    },
    {
        "type": "hygiene_breach_path",
        "check": lambda stats: stats.get("hygiene_breaches_per_week", 0) > 5,
        "severity": "critical",
        "fssai_reference": "Schedule 4, Section 3.2",
        "title": "Raw handling → RTE zone transition without hand wash — {breaches}/week",
        "root_cause": "Direct path from raw meat handling to ready-to-eat zone passes through without a wash basin.",
        "what_data_shows": "{breaches} hygiene breaches detected this week. High FSSAI violation risk.",
        "estimated_impact": "Eliminate cross-contamination risk. Avoid FSSAI inspection penalties (₹1L+).",
        "fixes": [
            {"cost_tier": "zero_cost", "description": "Floor marking + signage blocking direct path, forcing route via wash basin.", "implementation_time": "today", "cost_min": 300, "cost_max": 800, "expected_outcome": "Force compliance with correct routing"},
            {"cost_tier": "low_cost", "description": "Install second hand wash basin at raw handling station exit.", "implementation_time": "1 week", "cost_min": 2000, "cost_max": 5000, "expected_outcome": "Eliminate the root cause of the breach path"},
        ]
    },
    {
        "type": "bottleneck",
        "check": lambda stats: stats.get("peak_zone_occupancy", 0) > 0.80,
        "severity": "high",
        "title": "{zone_name} bottleneck — {pct}% occupancy at peak hours",
        "root_cause": "Single station handling too many orders during peak service window.",
        "what_data_shows": "{zone_name} runs at {pct}% capacity during peak hours, creating queues and increasing ticket times.",
        "estimated_impact": "Add parallel capacity to cut average ticket time by {minutes_saved} minutes.",
        "fixes": [
            {"cost_tier": "zero_cost", "description": "Assign second chef to station during peak hours only.", "implementation_time": "next shift", "expected_outcome": "Reduce wait time at station by 40%"},
            {"cost_tier": "low_cost", "description": "Add portable induction/equipment for peak service window.", "implementation_time": "1 week", "cost_min": 8000, "cost_max": 20000, "expected_outcome": "Double throughput at bottleneck station"},
        ]
    },
    {
        "type": "dead_zone",
        "check": lambda stats: stats.get("idle_zone_occupancy", 1) < 0.15,
        "severity": "medium",
        "title": "{zone_name} underutilised — {pct}% occupancy during peak",
        "root_cause": "Station or area is significantly underused during busy periods, indicating misaligned staffing or layout.",
        "what_data_shows": "{zone_name} runs at only {pct}% occupancy even during peak hours.",
        "estimated_impact": "Realign staffing to save ₹{monthly_saving}/month in idle labour.",
        "fixes": [
            {"cost_tier": "zero_cost", "description": "Adjust shift start times to match actual demand patterns.", "implementation_time": "next roster", "expected_outcome": "Eliminate idle labour cost"},
            {"cost_tier": "zero_cost", "description": "Reassign station responsibilities to handle prep/support tasks during low demand.", "implementation_time": "this week", "expected_outcome": "Increase productive utilisation"},
        ]
    },
]


async def compute_hourly_heatmap(outlet_id: str, db: AsyncSession):
    """Aggregate zone occupancy for the past hour and write snapshot."""
    now = datetime.utcnow()
    hour_start = now.replace(minute=0, second=0, microsecond=0)
    hour_end = hour_start + timedelta(hours=1)

    # Load occupancy events in this hour
    result = await db.execute(
        select(ZoneOccupancyEvent).where(
            and_(
                ZoneOccupancyEvent.outlet_id == outlet_id,
                ZoneOccupancyEvent.entered_at >= hour_start,
                ZoneOccupancyEvent.entered_at < hour_end,
            )
        )
    )
    events = result.scalars().all()

    if not events:
        return

    # Compute occupancy per zone
    zone_time: dict = defaultdict(float)
    for evt in events:
        if evt.duration_sec:
            zone_time[evt.zone_id] += evt.duration_sec

    total_time = sum(zone_time.values()) or 1
    zone_occupancy = {zid: round(t / 3600, 3) for zid, t in zone_time.items()}
    peak_zone = max(zone_time, key=zone_time.get) if zone_time else ""

    # Hygiene breaches this hour
    breach_result = await db.execute(
        select(func.count(ZoneTransition.id)).where(
            and_(
                ZoneTransition.outlet_id == outlet_id,
                ZoneTransition.timestamp >= hour_start,
                ZoneTransition.is_hygiene_breach == True,
            )
        )
    )
    breach_count = breach_result.scalar() or 0

    # Transitions this hour
    trans_result = await db.execute(
        select(func.count(ZoneTransition.id)).where(
            and_(
                ZoneTransition.outlet_id == outlet_id,
                ZoneTransition.timestamp >= hour_start,
            )
        )
    )
    transition_count = trans_result.scalar() or 0

    snapshot = ZoneHeatmapSnapshot(
        id=str(uuid.uuid4()),
        outlet_id=outlet_id,
        snapshot_hour=hour_start,
        zone_occupancy=zone_occupancy,
        peak_zone_id=peak_zone,
        total_transitions=transition_count,
        hygiene_breach_count=breach_count,
    )
    db.add(snapshot)
    await db.commit()


async def run_recommendation_engine(outlet_id: str, db: AsyncSession):
    """
    Analyse 14 days of heatmap data and generate layout recommendations.
    Does not duplicate existing open recommendations.
    """
    since = datetime.utcnow() - timedelta(days=14)

    # Load snapshots
    snaps_result = await db.execute(
        select(ZoneHeatmapSnapshot).where(
            and_(
                ZoneHeatmapSnapshot.outlet_id == outlet_id,
                ZoneHeatmapSnapshot.snapshot_hour >= since,
            )
        ).order_by(ZoneHeatmapSnapshot.snapshot_hour)
    )
    snapshots = snaps_result.scalars().all()

    if len(snapshots) < 24:
        logger.info(f"Not enough data for outlet {outlet_id} (only {len(snapshots)} snapshots)")
        return []

    # Load zones
    zones_result = await db.execute(
        select(KitchenZone).where(KitchenZone.outlet_id == outlet_id)
    )
    zones = zones_result.scalars().all()
    zone_map = {z.id: z for z in zones}

    # Aggregate stats
    total_breaches = sum(s.hygiene_breach_count for s in snapshots)
    breaches_per_week = total_breaches / 2  # 14 days / 2

    # Find peak occupancy zone
    zone_occupancy_totals: dict = defaultdict(float)
    for snap in snapshots:
        for zid, occ in snap.zone_occupancy.items():
            zone_occupancy_totals[zid] += occ
    avg_occupancy = {zid: v / len(snapshots) for zid, v in zone_occupancy_totals.items()}
    peak_zone_id = max(avg_occupancy, key=avg_occupancy.get) if avg_occupancy else None
    peak_occ = avg_occupancy.get(peak_zone_id, 0) if peak_zone_id else 0

    # Find idle zones
    idle_zone_id = min(avg_occupancy, key=avg_occupancy.get) if avg_occupancy else None
    idle_occ = avg_occupancy.get(idle_zone_id, 0) if idle_zone_id else 1

    # Transition analysis
    trans_result = await db.execute(
        select(ZoneTransition).where(
            and_(
                ZoneTransition.outlet_id == outlet_id,
                ZoneTransition.timestamp >= since,
            )
        )
    )
    transitions = trans_result.scalars().all()

    # Count transitions per zone pair
    pair_counts: dict = defaultdict(int)
    for t in transitions:
        pair_counts[(t.from_zone_id, t.to_zone_id)] += 1

    # Find cold store → prep transitions
    cold_zone_ids = {z.id for z in zones if "cold" in z.name.lower() or z.zone_type == "storage"}
    prep_zone_ids = {z.id for z in zones if z.zone_type == "prep"}
    cold_to_prep = sum(v for (f, t), v in pair_counts.items() if f in cold_zone_ids and t in prep_zone_ids)
    cold_to_prep_per_day = cold_to_prep / 14

    stats = {
        "hygiene_breaches_per_week": breaches_per_week,
        "peak_zone_occupancy": peak_occ,
        "idle_zone_occupancy": idle_occ,
        "cold_to_prep_transitions_per_day": cold_to_prep_per_day,
    }

    # Load existing open recommendations to avoid duplicates
    existing_result = await db.execute(
        select(LayoutRecommendation).where(
            and_(
                LayoutRecommendation.outlet_id == outlet_id,
                LayoutRecommendation.status == "open",
            )
        )
    )
    existing_types = {r.finding_type for r in existing_result.scalars().all()}

    generated = []
    for rule in FINDING_RULES:
        if rule["type"] in existing_types:
            continue
        if not rule["check"](stats):
            continue

        # Format title/description with actual values
        peak_zone_name = zone_map[peak_zone_id].name if peak_zone_id and peak_zone_id in zone_map else "Unknown"
        idle_zone_name = zone_map[idle_zone_id].name if idle_zone_id and idle_zone_id in zone_map else "Unknown"

        fmt = {
            "trips": int(cold_to_prep_per_day),
            "avg_dist": 22,
            "minutes_saved": int(cold_to_prep_per_day * 22 * 0.6 / 60),
            "breaches": int(breaches_per_week),
            "zone_name": peak_zone_name if rule["type"] == "bottleneck" else idle_zone_name,
            "pct": int(peak_occ * 100) if rule["type"] == "bottleneck" else int(idle_occ * 100),
            "monthly_saving": int(idle_occ * 300 * 8 * 25),  # rough estimate
        }

        rec = LayoutRecommendation(
            id=str(uuid.uuid4()),
            outlet_id=outlet_id,
            finding_type=rule["type"],
            severity=rule["severity"],
            title=rule["title"].format(**fmt),
            root_cause=rule["root_cause"],
            what_data_shows=rule["what_data_shows"].format(**fmt),
            estimated_impact=rule["estimated_impact"].format(**fmt),
            estimated_monthly_saving_inr=fmt.get("monthly_saving"),
            fssai_risk=rule.get("fssai_reference"),
            fixes=rule["fixes"],
            status="open",
        )
        db.add(rec)
        generated.append(rec)

    if generated:
        await db.commit()
        logger.info(f"Generated {len(generated)} layout recommendations for outlet {outlet_id}")

    return generated


async def run_all_outlets():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Outlet).where(Outlet.is_active == True))
        outlets = result.scalars().all()
        for outlet in outlets:
            try:
                await run_recommendation_engine(outlet.id, db)
            except Exception as e:
                logger.error(f"Recommendation engine failed for {outlet.id}: {e}")
