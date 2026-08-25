"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface ProfitSummary {
  revenue_inr: number;
  waste_cost_inr: number;
  leakage_cost_inr: number;
  portion_cost_inr: number;
  total_variance_cost_inr: number;
  margin_erosion_percent: number;
}

interface VarianceRecord {
  id: string;
  item_id: string;
  variance_type: "waste" | "leakage" | "portion_control";
  period_date: string;
  expected_qty: number;
  actual_qty: number;
  variance_qty: number;
  variance_percent: number;
  cost_impact_inr: number;
  confidence: number;
  status: "open" | "reviewed" | "resolved";
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  unit_cost_inr: number;
}

const VARIANCE_STYLE: Record<VarianceRecord["variance_type"], { color: string; label: string }> = {
  waste: { color: "#2a78d6", label: "Waste" },
  leakage: { color: "#eb6834", label: "Leakage" },
  portion_control: { color: "#1baf7a", label: "Portion control" },
};

function yesterday(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

export default function IntelligenceOutletPage() {
  const params = useParams();
  const outletId = params?.outletId as string;

  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [variances, setVariances] = useState<VarianceRecord[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputeDate, setRecomputeDate] = useState(yesterday());
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    if (outletId) fetchData();
  }, [outletId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [summaryRes, varianceRes, itemsRes] = await Promise.all([
        fetch(`/api/profit/outlet/${outletId}/summary?days=30`),
        fetch(`/api/variance/outlet/${outletId}?status=open`),
        fetch(`/api/inventory/outlet/${outletId}/items`),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (varianceRes.ok) setVariances(await varianceRes.json());
      if (itemsRes.ok) setItems(await itemsRes.json());
    } catch (e) {
      console.error("Failed to fetch intelligence data", e);
    } finally {
      setLoading(false);
    }
  }

  async function recompute() {
    setRecomputing(true);
    try {
      await fetch(`/api/profit/outlet/${outletId}/recompute?date=${recomputeDate}`, { method: "POST" });
      await fetchData();
    } finally {
      setRecomputing(false);
    }
  }

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? `${id.slice(0, 8)}…`;
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.unit ?? "";
  const lowStock = items.filter((i) => i.reorder_level > 0 && i.current_stock <= i.reorder_level);

  const costRows = summary
    ? [
        { key: "waste" as const, label: "Waste", value: summary.waste_cost_inr },
        { key: "leakage" as const, label: "Leakage", value: summary.leakage_cost_inr },
        { key: "portion_control" as const, label: "Portion control", value: summary.portion_cost_inr },
      ]
    : [];
  const maxCost = Math.max(1, ...costRows.map((c) => c.value));

  const cardStyle = { background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 };

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" as const, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>Profit impact</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
            Outlet {outletId.slice(0, 8)}… · trailing 30 days
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#888", marginBottom: 4, display: "block" }}>Recompute pipeline for</label>
            <input
              type="date"
              value={recomputeDate}
              onChange={(e) => setRecomputeDate(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }}
            />
          </div>
          <button
            onClick={recompute}
            disabled={recomputing}
            style={{ padding: "9px 16px", background: "#111", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: recomputing ? 0.6 : 1 }}
          >
            {recomputing ? "Running…" : "Recompute"}
          </button>
        </div>
      </div>

      {loading && <p style={{ color: "#aaa", fontSize: 13 }}>Loading…</p>}

      {!loading && summary && (
        <>
          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Revenue (30d)", value: `₹${summary.revenue_inr.toLocaleString("en-IN")}`, color: "#111" },
              { label: "Total variance cost", value: `₹${summary.total_variance_cost_inr.toLocaleString("en-IN")}`, color: summary.total_variance_cost_inr > 0 ? "#d03b3b" : "#0ca30c" },
              { label: "Margin erosion", value: `${summary.margin_erosion_percent}%`, color: summary.margin_erosion_percent > 5 ? "#d03b3b" : summary.margin_erosion_percent > 0 ? "#fab219" : "#0ca30c" },
              { label: "Open findings", value: variances.length, color: variances.length > 0 ? "#eb6834" : "#0ca30c" },
            ].map((c) => (
              <div key={c.label} style={cardStyle}>
                <p style={{ fontSize: 12, color: "#888", margin: "0 0 6px" }}>{c.label}</p>
                <p style={{ fontSize: 24, fontWeight: 600, color: c.color, margin: 0 }}>{c.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Cost breakdown */}
            <div style={cardStyle}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 16px" }}>Cost breakdown by category</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {costRows.map((row) => (
                  <div key={row.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "#333", fontWeight: 500 }}>{row.label}</span>
                      <span style={{ color: "#888" }}>₹{row.value.toLocaleString("en-IN")}</span>
                    </div>
                    <div style={{ background: "#f0f0ee", borderRadius: 4, height: 8, overflow: "hidden" }}>
                      <div style={{
                        width: `${(row.value / maxCost) * 100}%`,
                        background: VARIANCE_STYLE[row.key].color,
                        height: "100%",
                        borderRadius: 4,
                        minWidth: row.value > 0 ? 4 : 0,
                      }} />
                    </div>
                  </div>
                ))}
                {costRows.every((r) => r.value === 0) && (
                  <p style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: "12px 0" }}>No variance cost in this period</p>
                )}
              </div>
            </div>

            {/* Low stock */}
            <div style={cardStyle}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>
                Low stock
                {lowStock.length > 0 && (
                  <span style={{ marginLeft: 8, background: "#FEF3C7", color: "#D97706", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>
                    {lowStock.length}
                  </span>
                )}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                {lowStock.map((i) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#333" }}>{i.name}</span>
                    <span style={{ color: "#D97706" }}>{i.current_stock} / {i.reorder_level} {i.unit}</span>
                  </div>
                ))}
                {lowStock.length === 0 && (
                  <p style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: "12px 0" }}>All items above reorder level</p>
                )}
              </div>
            </div>
          </div>

          {/* Variance findings */}
          <div style={cardStyle}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>Open variance findings</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#888", borderBottom: "1px solid #f0f0f0" }}>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Item</th>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Type</th>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Date</th>
                  <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 400 }}>Variance</th>
                  <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 400 }}>Cost impact</th>
                </tr>
              </thead>
              <tbody>
                {variances.map((v) => {
                  const style = VARIANCE_STYLE[v.variance_type];
                  return (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f9f9f9" }}>
                      <td style={{ padding: "8px 0", color: "#222" }}>{itemName(v.item_id)}</td>
                      <td style={{ padding: "8px 0" }}>
                        <span style={{ background: `${style.color}1a`, color: style.color, fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                          {style.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 0", color: "#888" }}>{v.period_date.slice(0, 10)}</td>
                      <td style={{ padding: "8px 0", textAlign: "right", color: "#888" }}>
                        +{v.variance_qty.toFixed(2)} {itemUnit(v.item_id)} ({v.variance_percent.toFixed(0)}%)
                      </td>
                      <td style={{ padding: "8px 0", textAlign: "right", color: "#d03b3b", fontWeight: 600 }}>
                        ₹{v.cost_impact_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
                {variances.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#ccc", padding: 20 }}>No open findings</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
