"use client";

import { useEffect, useState } from "react";

interface ReportOptions {
  outletId: string;
  startDate: string;
  endDate: string;
  reportType: "compliance" | "hygiene" | "training" | "full_audit";
}

export default function ReportsPage() {
  const [options, setOptions] = useState<ReportOptions>({
    outletId: "",
    startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reportType: "full_audit",
  });
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  async function generateReport() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/compliance/outlet/${options.outletId}/score?days=30`);
      if (res.ok) setSummary(await res.json());
    } finally {
      setGenerating(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0",
    borderRadius: 6, fontSize: 13, outline: "none", background: "#fff",
    boxSizing: "border-box" as const,
  };

  const labelStyle = { fontSize: 11, color: "#888", marginBottom: 4, display: "block" as const };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>Reports & FSSAI audit</h1>
        <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>Generate compliance reports and export FSSAI audit documentation</p>
      </div>

      {/* Report builder */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>Generate report</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Outlet ID</label>
            <input style={inputStyle} value={options.outletId} onChange={e => setOptions(o => ({ ...o, outletId: e.target.value }))} placeholder="outlet-uuid" />
          </div>
          <div>
            <label style={labelStyle}>From</label>
            <input style={inputStyle} type="date" value={options.startDate} onChange={e => setOptions(o => ({ ...o, startDate: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input style={inputStyle} type="date" value={options.endDate} onChange={e => setOptions(o => ({ ...o, endDate: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Report type</label>
            <select style={inputStyle} value={options.reportType} onChange={e => setOptions(o => ({ ...o, reportType: e.target.value as ReportOptions["reportType"] }))}>
              <option value="full_audit">Full audit (FSSAI)</option>
              <option value="compliance">Compliance summary</option>
              <option value="hygiene">Hygiene violations</option>
              <option value="training">Training completion</option>
            </select>
          </div>
        </div>
        <button
          onClick={generateReport}
          disabled={!options.outletId || generating}
          style={{ padding: "9px 20px", background: "#FF6B2B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: generating || !options.outletId ? 0.6 : 1 }}
        >
          {generating ? "Generating..." : "Generate report"}
        </button>
      </div>

      {/* Report preview */}
      {summary && (
        <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>Report preview</p>
            <button
              style={{ padding: "7px 14px", border: "0.5px solid #ddd", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 12 }}
              onClick={() => alert("PDF export requires backend integration")}
            >
              Export PDF
            </button>
          </div>

          <div style={{ background: "#f8f8f6", borderRadius: 8, padding: 14, marginBottom: 14, borderLeft: "4px solid #FF6B2B" }}>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 4px" }}>FSSAI Compliance Report</p>
            <p style={{ fontSize: 11, color: "#aaa", margin: 0 }}>
              Outlet: {options.outletId} · Period: {options.startDate} to {options.endDate}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
            {[
              { label: "Overall compliance score", value: `${(summary as any).score ?? "—"}%` },
              { label: "Critical breaches", value: (summary as any).critical_breaches ?? 0 },
              { label: "Steps monitored", value: (summary as any).total_steps_expected ?? 0 },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 4px" }}>{c.label}</p>
                <p style={{ fontSize: 20, fontWeight: 600, color: "#111", margin: 0 }}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report types info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { title: "FSSAI Full Audit Report", desc: "Complete hygiene zone compliance, handwash violations, Schedule 4 breaches, with timestamp evidence. Court-admissible log format.", badge: "PDF", color: "#DC2626" },
          { title: "Daily Compliance Report", desc: "Per-chef, per-dish compliance scores. Step pass/fail breakdown. Critical violations highlighted.", badge: "PDF / CSV", color: "#D97706" },
          { title: "Training Completion Report", desc: "Which chefs completed which modules, scores, completion dates. Shows improvement over time.", badge: "PDF", color: "#2563EB" },
          { title: "Location Intelligence Report", desc: "Kitchen heatmap snapshots, hygiene breach paths, layout recommendations with cost estimates.", badge: "PDF", color: "#16A34A" },
        ].map(r => (
          <div key={r.title} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>{r.title}</p>
              <span style={{ fontSize: 10, background: "#f3f4f6", color: "#555", padding: "2px 6px", borderRadius: 3 }}>{r.badge}</span>
            </div>
            <p style={{ fontSize: 12, color: "#888", margin: 0 }}>{r.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
