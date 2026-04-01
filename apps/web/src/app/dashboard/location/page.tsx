"use client";

import { useEffect, useState } from "react";

interface Zone {
  id: string;
  name: string;
  zone_type: string;
  is_hygiene_sensitive: boolean;
}

interface HeatmapData {
  outlet_id: string;
  zone_averages: Record<string, number>;
  total_breaches: number;
  peak_zone_id: string;
}

interface Recommendation {
  id: string;
  finding_type: string;
  severity: string;
  title: string;
  root_cause: string;
  what_data_shows: string;
  estimated_impact: string;
  fssai_risk?: string;
  fixes: {
    cost_tier: string;
    description: string;
    implementation_time: string;
    cost_estimate_inr_min?: number;
    cost_estimate_inr_max?: number;
  }[];
  status: string;
}

const SEVERITY_CONFIG = {
  critical: { bg: "#FEE2E2", text: "#DC2626", border: "#FECACA" },
  high:     { bg: "#FEF3C7", text: "#D97706", border: "#FDE68A" },
  medium:   { bg: "#DBEAFE", text: "#2563EB", border: "#BFDBFE" },
  low:      { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
};

const COST_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  zero_cost:   { label: "₹0 · Immediate",   bg: "#DCFCE7", text: "#16A34A" },
  low_cost:    { label: "Low cost",          bg: "#FEF3C7", text: "#D97706" },
  medium_cost: { label: "Medium cost",       bg: "#DBEAFE", text: "#2563EB" },
  structural:  { label: "Structural",        bg: "#FEE2E2", text: "#DC2626" },
};

const ZONE_TYPE_COLOR: Record<string, string> = {
  cooking:      "#FF6B2B",
  prep:         "#F5A623",
  hygiene:      "#2ECC71",
  storage:      "#3498DB",
  pass:         "#9B59B6",
  raw_handling: "#E74C3C",
  ready_to_eat: "#1ABC9C",
  circulation:  "#95A5A6",
};

export default function LocationPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [outletId] = useState("demo-outlet");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [zonesRes, heatRes, recRes] = await Promise.all([
        fetch(`/api/location/outlet/${outletId}/zones`),
        fetch(`/api/location/outlet/${outletId}/heatmap?hours=8`),
        fetch(`/api/location/outlet/${outletId}/recommendations?status=open`),
      ]);
      if (zonesRes.ok) setZones(await zonesRes.json());
      if (heatRes.ok) setHeatmap(await heatRes.json());
      if (recRes.ok) setRecommendations(await recRes.json());
    } finally {
      setLoading(false);
    }
  }

  async function updateRecStatus(recId: string, status: string) {
    await fetch(`/api/location/recommendations/${recId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRecommendations(prev => prev.map(r => r.id === recId ? { ...r, status } : r));
  }

  const criticalCount = recommendations.filter(r => r.severity === "critical").length;

  // Build grid layout for heatmap (mock 2×4 grid)
  const gridZones = zones.length > 0 ? zones : [
    { id: "z1", name: "Grill station",  zone_type: "cooking",      is_hygiene_sensitive: false },
    { id: "z2", name: "Tandoor",        zone_type: "cooking",      is_hygiene_sensitive: false },
    { id: "z3", name: "Prep area",      zone_type: "prep",         is_hygiene_sensitive: false },
    { id: "z4", name: "Cold store",     zone_type: "storage",      is_hygiene_sensitive: false },
    { id: "z5", name: "Plating",        zone_type: "pass",         is_hygiene_sensitive: false },
    { id: "z6", name: "Wash station",   zone_type: "hygiene",      is_hygiene_sensitive: true  },
    { id: "z7", name: "Pass / pickup",  zone_type: "pass",         is_hygiene_sensitive: false },
    { id: "z8", name: "Raw meat",       zone_type: "raw_handling", is_hygiene_sensitive: true  },
  ];

  // Mock occupancy if no real data
  const mockOccupancy: Record<string, number> = {
    z1: 0.87, z2: 0.64, z3: 0.38, z4: 0.12,
    z5: 0.58, z6: 0.29, z7: 0.82, z8: 0.45,
  };
  const occupancy = (heatmap?.zone_averages && Object.keys(heatmap.zone_averages).length > 0)
    ? heatmap.zone_averages : mockOccupancy;

  function getOccColor(occ: number): string {
    if (occ > 0.75) return "#FEE2E2";
    if (occ > 0.5)  return "#FEF3C7";
    if (occ > 0.25) return "#DCFCE7";
    return "#F3F4F6";
  }

  function getOccTextColor(occ: number): string {
    if (occ > 0.75) return "#DC2626";
    if (occ > 0.5)  return "#D97706";
    if (occ > 0.25) return "#16A34A";
    return "#9CA3AF";
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>Location intelligence</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
            Kitchen activity · last 8 hours
            {criticalCount > 0 && (
              <span style={{ marginLeft: 10, background: "#FEE2E2", color: "#DC2626", fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                {criticalCount} critical finding{criticalCount > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetch(`/api/location/outlet/${outletId}/recommendations/generate`, { method: "POST" })}
          style={{ padding: "8px 16px", border: "0.5px solid #e0e0e0", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}
        >
          Refresh analysis
        </button>
      </div>

      {/* Heatmap grid */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 4px" }}>Kitchen activity heatmap</p>
        <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 14px" }}>Derived from CCTV movement tracking · colour = occupancy intensity</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {gridZones.map((zone) => {
            const occ = occupancy[zone.id] ?? 0;
            const pct = Math.round(occ * 100);
            return (
              <div key={zone.id} style={{
                background: getOccColor(occ),
                borderRadius: 10,
                padding: 14,
                border: zone.is_hygiene_sensitive ? "1.5px dashed #D97706" : "1px solid transparent",
                position: "relative",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: ZONE_TYPE_COLOR[zone.zone_type] ?? "#ccc",
                  position: "absolute", top: 10, right: 10,
                }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "#333", margin: "0 0 4px" }}>{zone.name}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: getOccTextColor(occ), margin: "0 0 2px" }}>{pct}%</p>
                <p style={{ fontSize: 10, color: "#aaa", margin: 0 }}>occupancy</p>
                {zone.is_hygiene_sensitive && (
                  <p style={{ fontSize: 9, color: "#D97706", margin: "4px 0 0" }}>hygiene zone</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {[
            { color: "#FEE2E2", label: "Overloaded (>75%)" },
            { color: "#FEF3C7", label: "High (50–75%)" },
            { color: "#DCFCE7", label: "Normal (25–50%)" },
            { color: "#F3F4F6", label: "Underused (<25%)" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, background: l.color, border: "1px solid #e5e5e5", borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: "#888" }}>{l.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, border: "1.5px dashed #D97706", borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#888" }}>Hygiene-sensitive</span>
          </div>
        </div>
      </div>

      {/* Layout recommendations */}
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111", margin: "0 0 12px" }}>
          Layout recommendations ({recommendations.filter(r => r.status === "open").length} open)
        </p>

        {recommendations.length === 0 && !loading && (
          <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 30, textAlign: "center" }}>
            <p style={{ color: "#aaa", margin: 0 }}>No recommendations yet — need 14+ days of data. Run analysis to check.</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {recommendations.map(rec => {
            const sev = SEVERITY_CONFIG[rec.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.medium;
            const isExpanded = expandedRec === rec.id;

            return (
              <div key={rec.id} style={{
                background: "#fff",
                border: `1px solid ${sev.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}>
                {/* Header row */}
                <div
                  onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                  style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <span style={{
                    background: sev.bg, color: sev.text,
                    fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                    whiteSpace: "nowrap", marginTop: 1,
                  }}>
                    {rec.severity}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 3px" }}>{rec.title}</p>
                    <p style={{ fontSize: 12, color: "#888", margin: 0 }}>{rec.what_data_shows}</p>
                    {rec.fssai_risk && (
                      <p style={{ fontSize: 11, color: "#DC2626", margin: "4px 0 0" }}>
                        ⚠ FSSAI: {rec.fssai_risk}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {rec.status === "open" && (
                      <button onClick={e => { e.stopPropagation(); updateRecStatus(rec.id, "in_progress"); }}
                        style={{ fontSize: 11, padding: "4px 10px", border: "0.5px solid #ddd", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#555" }}>
                        Start fix
                      </button>
                    )}
                    {rec.status === "in_progress" && (
                      <button onClick={e => { e.stopPropagation(); updateRecStatus(rec.id, "resolved"); }}
                        style={{ fontSize: 11, padding: "4px 10px", border: "0.5px solid #BBF7D0", borderRadius: 6, cursor: "pointer", background: "#DCFCE7", color: "#16A34A" }}>
                        Mark resolved
                      </button>
                    )}
                    <span style={{ fontSize: 18, color: "#ccc" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #f0f0f0", padding: "14px 16px", background: "#fafafa" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                      <div>
                        <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 4px" }}>Root cause</p>
                        <p style={{ fontSize: 13, color: "#444", margin: 0 }}>{rec.root_cause}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 4px" }}>Estimated impact if fixed</p>
                        <p style={{ fontSize: 13, color: "#16A34A", fontWeight: 500, margin: 0 }}>{rec.estimated_impact}</p>
                      </div>
                    </div>

                    <p style={{ fontSize: 12, fontWeight: 600, color: "#555", margin: "0 0 8px" }}>Recommended fixes — ranked by cost</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rec.fixes.map((fix, fi) => {
                        const badge = COST_BADGE[fix.cost_tier] ?? COST_BADGE.low_cost;
                        return (
                          <div key={fi} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <span style={{
                              background: badge.bg, color: badge.text,
                              fontSize: 10, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                              fontWeight: 600, marginTop: 1,
                            }}>
                              {badge.label}
                              {fix.cost_estimate_inr_min && ` · ₹${(fix.cost_estimate_inr_min / 1000).toFixed(0)}K–₹${((fix.cost_estimate_inr_max ?? 0) / 1000).toFixed(0)}K`}
                            </span>
                            <div>
                              <p style={{ fontSize: 13, color: "#333", margin: 0 }}>{fix.description}</p>
                              <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>{fix.implementation_time}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
