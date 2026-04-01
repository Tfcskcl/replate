"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SOPRecord {
  id: string;
  dish_name: string;
  recorded_by: string;
  recorded_at: string;
  status: string;
  is_locked: boolean;
  lock_hash?: string;
  version: number;
  steps: { id: string }[];
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  locked:     { bg: "#DCFCE7", text: "#16A34A" },
  review:     { bg: "#DBEAFE", text: "#2563EB" },
  annotating: { bg: "#FEF3C7", text: "#D97706" },
  draft:      { bg: "#F3F4F6", text: "#6B7280" },
};

export default function SOPLibraryPage() {
  const [sops, setSops] = useState<SOPRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [outletId, setOutletId] = useState("");

  useEffect(() => {
    // Get outlet from URL or user context
    const id = new URLSearchParams(window.location.search).get("outlet") ?? "";
    setOutletId(id);
    if (id) fetchSOPs(id);
    else setLoading(false);
  }, []);

  async function fetchSOPs(oid: string) {
    try {
      const res = await fetch(`/api/sops/outlet/${oid}`);
      if (res.ok) setSops(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const locked = sops.filter(s => s.is_locked).length;
  const pending = sops.filter(s => !s.is_locked).length;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", margin: 0 }}>SOP Library</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
            {locked} locked · {pending} pending annotation
          </p>
        </div>
        <Link href="/dashboard/sop/new" style={{ padding: "9px 18px", background: "#FF6B2B", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
          + New recording
        </Link>
      </div>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total dishes", value: sops.length },
          { label: "Locked SOPs", value: locked, color: "#16A34A" },
          { label: "In review", value: sops.filter(s => s.status === "review").length, color: "#2563EB" },
          { label: "Draft", value: sops.filter(s => s.status === "draft").length, color: "#9CA3AF" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 4px" }}>{c.label}</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: c.color ?? "#111", margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* SOP table */}
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f8f6", borderBottom: "1px solid #eee" }}>
              <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 500, color: "#555" }}>Dish</th>
              <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 500, color: "#555" }}>Recorded by</th>
              <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 500, color: "#555" }}>Steps</th>
              <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 500, color: "#555" }}>Status</th>
              <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 500, color: "#555" }}>Version</th>
              <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 500, color: "#555" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "#ccc" }}>Loading...</td></tr>
            ) : sops.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 40 }}>
                  <p style={{ color: "#ccc", margin: "0 0 10px" }}>No SOPs recorded yet</p>
                  <Link href="/dashboard/sop/new" style={{ color: "#FF6B2B", textDecoration: "none", fontSize: 13 }}>Record your first SOP →</Link>
                </td>
              </tr>
            ) : sops.map(sop => {
              const ss = STATUS_STYLE[sop.status] ?? STATUS_STYLE.draft;
              return (
                <tr key={sop.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ fontWeight: 500, color: "#111", margin: 0 }}>{sop.dish_name}</p>
                    {sop.lock_hash && (
                      <p style={{ fontSize: 10, color: "#aaa", margin: "2px 0 0", fontFamily: "monospace" }}>
                        🔒 {sop.lock_hash.slice(0, 16)}…
                      </p>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{sop.recorded_by}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center", color: "#555" }}>{sop.steps?.length ?? 0}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <span style={{ background: ss.bg, color: ss.text, fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                      {sop.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center", color: "#888" }}>v{sop.version}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Link href={`/dashboard/sop/${sop.id}`}
                      style={{ color: "#FF6B2B", textDecoration: "none", fontSize: 12, fontWeight: 500 }}>
                      {sop.is_locked ? "View" : "Annotate"} →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
