"use client";

import { useEffect, useState } from "react";

interface PartnerStats {
  active_clients: number;
  monthly_billing: number;
  partner_monthly_earnings: number;
  projected_annual: number;
  current_tier: string;
  clients_to_next_tier: number;
}

interface Statement {
  id: string;
  month: string;
  year: number;
  total_billing: number;
  partner_share: number;
  payment_status: string;
  paid_at?: string;
  utr_number?: string;
  line_items: {
    outlet_name: string;
    restaurant_name: string;
    plan: string;
    billing_amount: number;
    partner_amount: number;
  }[];
}

const TIER_COLORS = {
  explorer: { bg: "#F0F9FF", text: "#0369A1", label: "Explorer" },
  builder:  { bg: "#FEF3C7", text: "#92400E", label: "Builder" },
  elite:    { bg: "#F0FDF4", text: "#166534", label: "Elite" },
};

export default function PartnersPage() {
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPartnerData();
  }, []);

  async function fetchPartnerData() {
    try {
      const [statsRes, stmtsRes] = await Promise.all([
        fetch("/api/partners/me/performance"),
        fetch("/api/revenue/partner/me/statements"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (stmtsRes.ok) setStatements(await stmtsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ color: "#888", padding: 40 }}>Loading partner dashboard...</div>;

  const tier = stats?.current_tier ?? "explorer";
  const tierStyle = TIER_COLORS[tier as keyof typeof TIER_COLORS] ?? TIER_COLORS.explorer;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>Partner portal</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>Revenue share · 60% of all client billings</p>
        </div>
        <span style={{
          background: tierStyle.bg, color: tierStyle.text,
          padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
        }}>{tierStyle.label} partner</span>
      </div>

      {/* Earnings cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Active clients", value: stats?.active_clients ?? 0, color: "#111", suffix: "" },
          { label: "This month earnings", value: `₹${((stats?.partner_monthly_earnings ?? 0) / 1000).toFixed(1)}K`, color: "#16A34A", suffix: "" },
          { label: "Projected annual", value: `₹${((stats?.projected_annual ?? 0) / 100000).toFixed(1)}L`, color: "#2563EB", suffix: "" },
          { label: "Clients to next tier", value: stats?.clients_to_next_tier ?? "—", color: "#D97706", suffix: "" },
        ].map((card) => (
          <div key={card.label} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 6px" }}>{card.label}</p>
            <p style={{ fontSize: 26, fontWeight: 600, color: card.color, margin: 0 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue illustration */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>Revenue share breakdown</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { plan: "Starter (₹3,000/mo)", partner: "₹1,800", replate: "₹1,200", color: "#6B7280" },
            { plan: "Pro (₹6,500/mo)", partner: "₹3,900", replate: "₹2,600", color: "#FF6B2B" },
            { plan: "Enterprise (₹12,000/mo)", partner: "₹7,200", replate: "₹4,800", color: "#F5A623" },
          ].map((row) => (
            <div key={row.plan} style={{ background: "#f8f8f6", borderRadius: 8, padding: 14, borderLeft: `4px solid ${row.color}` }}>
              <p style={{ fontSize: 12, color: "#888", margin: "0 0 8px" }}>{row.plan}</p>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#16A34A", margin: "0 0 2px" }}>You: {row.partner}</p>
              <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>Re-plate: {row.replate}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Statements */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>Monthly statements</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#888", borderBottom: "1px solid #f0f0f0" }}>
              <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 400 }}>Period</th>
              <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 400 }}>Total billing</th>
              <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 400 }}>Your share (60%)</th>
              <th style={{ textAlign: "center", padding: "6px 0", fontWeight: 400 }}>Status</th>
              <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 400 }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((stmt) => (
              <tr key={stmt.id} style={{ borderBottom: "1px solid #f9f9f9" }}>
                <td style={{ padding: "10px 0", color: "#222" }}>{stmt.month}/{stmt.year}</td>
                <td style={{ padding: "10px 0", textAlign: "right", color: "#555" }}>
                  ₹{stmt.total_billing.toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, color: "#16A34A" }}>
                  ₹{stmt.partner_share.toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "10px 0", textAlign: "center" }}>
                  <span style={{
                    background: stmt.payment_status === "paid" ? "#DCFCE7" : "#FEF3C7",
                    color: stmt.payment_status === "paid" ? "#16A34A" : "#92400E",
                    fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                  }}>
                    {stmt.payment_status === "paid" ? `Paid · ${stmt.utr_number}` : "Pending"}
                  </span>
                </td>
                <td style={{ padding: "10px 0", textAlign: "right" }}>
                  <button
                    onClick={() => setSelectedStatement(selectedStatement?.id === stmt.id ? null : stmt)}
                    style={{ background: "none", border: "0.5px solid #ddd", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "#555" }}
                  >
                    {selectedStatement?.id === stmt.id ? "Hide" : "View"}
                  </button>
                </td>
              </tr>
            ))}
            {statements.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#ccc", padding: 20 }}>No statements yet</td></tr>
            )}
          </tbody>
        </table>

        {/* Statement detail */}
        {selectedStatement && (
          <div style={{ marginTop: 16, background: "#f8f8f6", borderRadius: 8, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: "0 0 10px" }}>
              Statement detail — {selectedStatement.month}/{selectedStatement.year}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#888" }}>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Outlet</th>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Plan</th>
                  <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 400 }}>Billing</th>
                  <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 400 }}>Your share</th>
                </tr>
              </thead>
              <tbody>
                {selectedStatement.line_items.map((item, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "6px 0", color: "#333" }}>{item.outlet_name}</td>
                    <td style={{ padding: "6px 0", color: "#888" }}>{item.plan}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", color: "#555" }}>₹{item.billing_amount.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", color: "#16A34A", fontWeight: 600 }}>₹{item.partner_amount.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
