"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IntelligenceIndexPage() {
  const router = useRouter();
  const [outletId, setOutletId] = useState("");

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0",
    borderRadius: 6, fontSize: 13, outline: "none", background: "#fff",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>Hospitality Intelligence</h1>
        <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
          POS/ERP, Smart Scale, and Jarvis events → inventory, consumption, and variance intelligence → profit impact.
        </p>
      </div>

      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 14px" }}>View an outlet</p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#888", marginBottom: 4, display: "block" }}>Outlet ID</label>
            <input
              style={inputStyle}
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              placeholder="outlet-uuid"
              onKeyDown={(e) => e.key === "Enter" && outletId && router.push(`/dashboard/intelligence/${outletId}`)}
            />
          </div>
          <button
            onClick={() => outletId && router.push(`/dashboard/intelligence/${outletId}`)}
            disabled={!outletId}
            style={{ padding: "9px 20px", background: "#FF6B2B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: outletId ? 1 : 0.6 }}
          >
            View
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { title: "Waste", desc: "Consumption gaps covered by logged waste transactions (spoilage, over-prep, disposal).", color: "#2a78d6" },
          { title: "Leakage", desc: "Unexplained gaps corroborated by a Jarvis unrecorded-removal or unauthorized-access event.", color: "#eb6834" },
          { title: "Portion control", desc: "Unexplained over-serving beyond recipe quantity, with no waste or leakage evidence.", color: "#1baf7a" },
        ].map((c) => (
          <div key={c.title} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: 14, borderTop: `3px solid ${c.color}` }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: "0 0 6px" }}>{c.title}</p>
            <p style={{ fontSize: 12, color: "#888", margin: 0 }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
