"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface ChefScore {
  chef_id: string;
  chef_name: string;
  score: number;
  top_issue: string;
  error_count: number;
}

interface Alert {
  id: string;
  chef_name: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  step_name?: string;
  dish_name: string;
  timestamp: string;
  details: Record<string, unknown>;
}

interface ComplianceScore {
  score: number;
  critical_breaches: number;
  steps_passed: number;
  steps_failed: number;
  chef_scores: ChefScore[];
}

interface TrainingModule {
  id: string;
  chef_name: string;
  title: string;
  module_type: string;
  due_date: string;
  completed_at?: string;
  priority: number;
}

const SEV_STYLE = {
  critical: { bg: "#FEE2E2", text: "#DC2626" },
  warning:  { bg: "#FEF3C7", text: "#D97706" },
  info:     { bg: "#DBEAFE", text: "#2563EB" },
};

export default function OutletDetailPage() {
  const params = useParams();
  const outletId = params?.outletId as string;
  const wsRef = useRef<WebSocket | null>(null);

  const [compliance, setCompliance] = useState<ComplianceScore | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [training, setTraining] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (outletId) {
      fetchData();
      setupWS();
    }
    return () => wsRef.current?.close();
  }, [outletId]);

  async function fetchData() {
    try {
      const [scoreRes, alertsRes, trainingRes] = await Promise.all([
        fetch(`/api/compliance/outlet/${outletId}/score?days=1`),
        fetch(`/api/compliance/outlet/${outletId}/events?severity=warning&per_page=20`),
        fetch(`/api/training/outlet/${outletId}/pending`),
      ]);
      if (scoreRes.ok) setCompliance(await scoreRes.json());
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.data || []);
      }
      if (trainingRes.ok) setTraining(await trainingRes.json());
    } finally {
      setLoading(false);
    }
  }

  function setupWS() {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
    const ws = new WebSocket(`${wsUrl}/ws/alerts/${outletId}`);
    ws.onmessage = (e) => {
      const alert: Alert = JSON.parse(e.data);
      setAlerts(prev => [alert, ...prev].slice(0, 50));
    };
    wsRef.current = ws;
  }

  const score = compliance?.score ?? 100;
  const scoreColor = score >= 80 ? "#16A34A" : score >= 60 ? "#D97706" : "#DC2626";
  const scoreBg = score >= 80 ? "#DCFCE7" : score >= 60 ? "#FEF3C7" : "#FEE2E2";

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <Link href="/dashboard/outlets" style={{ fontSize: 12, color: "#aaa", textDecoration: "none" }}>← Outlets</Link>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111", margin: "4px 0 0" }}>Outlet — {outletId.slice(0, 8)}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/dashboard/sop?outlet=${outletId}`}
            style={{ padding: "8px 14px", border: "0.5px solid #e0e0e0", borderRadius: 8, background: "#fff", textDecoration: "none", fontSize: 13, color: "#555" }}>
            SOP Library
          </Link>
          <Link href={`/dashboard/location?outlet=${outletId}`}
            style={{ padding: "8px 14px", border: "0.5px solid #e0e0e0", borderRadius: 8, background: "#fff", textDecoration: "none", fontSize: 13, color: "#555" }}>
            Location intel
          </Link>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Compliance score", value: `${score}%`, color: scoreColor, bg: scoreBg },
          { label: "Critical breaches", value: compliance?.critical_breaches ?? 0, color: "#DC2626", bg: "#FEE2E2" },
          { label: "Steps passed", value: compliance?.steps_passed ?? 0, color: "#16A34A", bg: "#DCFCE7" },
          { label: "Training pending", value: training.filter(t => !t.completed_at).length, color: "#D97706", bg: "#FEF3C7" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 4px" }}>{c.label}</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: c.color, margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Chef scores */}
        <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 12px" }}>Chef compliance — today</p>
          {loading ? <p style={{ color: "#ccc" }}>Loading...</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#aaa", borderBottom: "1px solid #f0f0f0" }}>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 400 }}>Chef</th>
                  <th style={{ textAlign: "center", padding: "4px 0", fontWeight: 400 }}>Score</th>
                  <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 400 }}>Top issue</th>
                </tr>
              </thead>
              <tbody>
                {(compliance?.chef_scores ?? []).map(c => {
                  const col = c.score >= 80 ? "#16A34A" : c.score >= 60 ? "#D97706" : "#DC2626";
                  const bg  = c.score >= 80 ? "#DCFCE7" : c.score >= 60 ? "#FEF3C7" : "#FEE2E2";
                  return (
                    <tr key={c.chef_id} style={{ borderBottom: "1px solid #fafafa" }}>
                      <td style={{ padding: "8px 0", color: "#222" }}>{c.chef_name}</td>
                      <td style={{ padding: "8px 0", textAlign: "center" }}>
                        <span style={{ background: bg, color: col, fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                          {c.score}%
                        </span>
                      </td>
                      <td style={{ padding: "8px 0", textAlign: "right", color: "#888", fontSize: 12 }}>
                        {c.top_issue?.replace(/_/g, " ") ?? "—"}
                      </td>
                    </tr>
                  );
                })}
                {(compliance?.chef_scores ?? []).length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "#ddd", padding: 16 }}>No chef data yet</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Live alerts */}
        <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>Live alerts</p>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A", display: "inline-block", animation: "pulse 2s infinite" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {alerts.slice(0, 15).map(alert => {
              const ss = SEV_STYLE[alert.severity];
              return (
                <div key={alert.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ background: ss.bg, color: ss.text, fontSize: 10, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap", marginTop: 1, fontWeight: 600 }}>
                    {alert.severity}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, color: "#333", margin: 0 }}>
                      {alert.chef_name} — {alert.dish_name}
                      {alert.step_name ? `: ${alert.step_name}` : ""}
                    </p>
                    <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>
                      {alert.event_type.replace(/_/g, " ")} · {new Date(alert.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            {alerts.length === 0 && <p style={{ color: "#ddd", fontSize: 13, textAlign: "center", padding: 16 }}>No alerts</p>}
          </div>
        </div>
      </div>

      {/* Training modules */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>Training plans — pending</p>
          <button
            onClick={() => fetch(`/api/training/outlet/${outletId}/generate`, { method: "POST" }).then(() => fetchData())}
            style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid #ddd", borderRadius: 7, cursor: "pointer", background: "#fff" }}
          >
            Regenerate plans
          </button>
        </div>
        {training.filter(t => !t.completed_at).length === 0 ? (
          <p style={{ color: "#ccc", fontSize: 13 }}>No pending training modules</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
            {training.filter(t => !t.completed_at).slice(0, 6).map(mod => (
              <div key={mod.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, background: "#F0F9FF", color: "#0369A1", padding: "2px 6px", borderRadius: 3 }}>
                    {mod.module_type.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 10, color: "#aaa" }}>P{mod.priority}</span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#222", margin: "4px 0 2px" }}>{mod.title}</p>
                <p style={{ fontSize: 11, color: "#888", margin: 0 }}>{mod.chef_name} · due {new Date(mod.due_date).toLocaleDateString("en-IN")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
