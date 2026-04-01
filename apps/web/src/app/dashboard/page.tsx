"use client";

import { useEffect, useState, useRef } from "react";

interface ComplianceScore {
  outlet_id: string;
  score: number;
  critical_breaches: number;
  chef_scores: { chef_name: string; score: number; top_issue: string }[];
}

interface Alert {
  id: string;
  outlet_id: string;
  chef_name: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  step_name?: string;
  dish_name: string;
  timestamp: string;
  details: Record<string, unknown>;
}

const SEVERITY_COLOR = {
  critical: { bg: "#FEE2E2", text: "#DC2626", label: "critical" },
  warning:  { bg: "#FEF3C7", text: "#D97706", label: "warning" },
  info:     { bg: "#DBEAFE", text: "#2563EB", label: "info" },
};

const PLAN_PRICE = { starter: 3000, pro: 6500, enterprise: 12000 };

export default function DashboardPage() {
  const [scores, setScores] = useState<ComplianceScore[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState({ totalOutlets: 0, activeDevices: 0, openRecommendations: 0, pendingModules: 0 });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchData();
    setupWebSocket();
    return () => wsRef.current?.close();
  }, []);

  async function fetchData() {
    try {
      const [scoresRes, statsRes, alertsRes] = await Promise.all([
        fetch("/api/compliance/scores"),
        fetch("/api/dashboard/stats"),
        fetch("/api/compliance/recent-alerts"),
      ]);
      if (scoresRes.ok) setScores(await scoresRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
    } catch (e) {
      console.error("Failed to fetch dashboard data", e);
    }
  }

  function setupWebSocket() {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "wss://api.re-plate.in";
    const ws = new WebSocket(`${wsUrl}/ws/alerts/all`);
    ws.onmessage = (evt) => {
      const alert: Alert = JSON.parse(evt.data);
      setAlerts(prev => [alert, ...prev].slice(0, 50));
    };
    wsRef.current = ws;
  }

  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length)
    : 100;

  const criticalCount = alerts.filter(a => a.severity === "critical" && !isOld(a.timestamp)).length;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>Kitchen compliance</h1>
        <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
          All outlets · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Overall score", value: `${overallScore}%`, sub: `${scores.length} outlets`, color: overallScore >= 80 ? "#16A34A" : overallScore >= 60 ? "#D97706" : "#DC2626" },
          { label: "Critical alerts today", value: criticalCount, sub: "unacknowledged", color: criticalCount > 0 ? "#DC2626" : "#16A34A" },
          { label: "Open layout findings", value: stats.openRecommendations, sub: "need attention", color: "#D97706" },
          { label: "Training pending", value: stats.pendingModules, sub: "modules assigned", color: "#2563EB" },
        ].map((card) => (
          <div key={card.label} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 6px" }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 600, color: card.color, margin: 0 }}>{card.value}</p>
            <p style={{ fontSize: 11, color: "#aaa", margin: "4px 0 0" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Two-col: Outlet scores + Live alerts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* Outlet scores */}
        <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>Outlet compliance — today</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "1px solid #f0f0f0" }}>
                <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Outlet</th>
                <th style={{ textAlign: "center", padding: "4px 0", fontWeight: 400 }}>Score</th>
                <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 400 }}>Top issue</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => {
                const color = s.score >= 80 ? "#16A34A" : s.score >= 60 ? "#D97706" : "#DC2626";
                const bgColor = s.score >= 80 ? "#DCFCE7" : s.score >= 60 ? "#FEF3C7" : "#FEE2E2";
                const topIssue = s.chef_scores[0]?.top_issue ?? "—";
                return (
                  <tr key={s.outlet_id} style={{ borderBottom: "1px solid #f9f9f9" }}>
                    <td style={{ padding: "8px 0", color: "#222" }}>{s.outlet_id.slice(0, 8)}…</td>
                    <td style={{ padding: "8px 0", textAlign: "center" }}>
                      <span style={{ background: bgColor, color, fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                        {s.score}%
                      </span>
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right", color: "#888", fontSize: 12 }}>
                      {topIssue.replace(/_/g, " ")}
                    </td>
                  </tr>
                );
              })}
              {scores.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "#ccc", padding: 20 }}>No outlet data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Live alerts */}
        <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>
            Live alerts
            {criticalCount > 0 && (
              <span style={{ marginLeft: 8, background: "#FEE2E2", color: "#DC2626", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>
                {criticalCount} critical
              </span>
            )}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {alerts.slice(0, 15).map((alert) => {
              const sev = SEVERITY_COLOR[alert.severity];
              return (
                <div key={alert.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{
                    background: sev.bg, color: sev.text,
                    fontSize: 10, padding: "2px 6px", borderRadius: 3,
                    whiteSpace: "nowrap", marginTop: 2, fontWeight: 600,
                  }}>
                    {sev.label}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, color: "#333", margin: 0 }}>
                      {alert.chef_name} — {alert.dish_name}
                      {alert.step_name ? `: ${alert.step_name}` : ""}
                    </p>
                    <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>
                      {alert.event_type.replace(/_/g, " ")} · {formatTime(alert.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
            {alerts.length === 0 && (
              <p style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: 20 }}>No alerts — kitchen running smoothly</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>Quick actions</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Add new outlet", href: "/dashboard/outlets/new" },
            { label: "Record SOP", href: "/dashboard/sop/new" },
            { label: "View heatmap", href: "/dashboard/location" },
            { label: "Generate reports", href: "/dashboard/reports" },
            { label: "Manage partners", href: "/dashboard/partners" },
          ].map((action) => (
            <a key={action.href} href={action.href} style={{
              background: "#f8f8f6",
              border: "0.5px solid #e0e0e0",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              color: "#333",
              textDecoration: "none",
              fontWeight: 500,
            }}>
              {action.label} →
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function isOld(ts: string): boolean {
  return Date.now() - new Date(ts).getTime() > 1000 * 60 * 60 * 8;
}
