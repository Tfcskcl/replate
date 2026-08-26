import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, MovementBadge } from "@/components/kit";
import { formatWeight, formatDateTime } from "@/lib/format";
import { Scale } from "lucide-react";

export default function WeighingEvents() {
  const { selectedOutletId } = useAuth();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!selectedOutletId) return;
    api.get(`/scale-events?outlet_id=${selectedOutletId}`).then(({ data }) => setRows(data));
  }, [selectedOutletId]);

  return (
    <div>
      <PageHeader label="Scale Data Stream" title="Weighing Events" />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-left">
              {["Time", "Product", "Weight", "Type", "Stability", "Device", "Operator", "Sync"].map((h) => (
                <th key={h} className="micro-label font-normal px-4 py-3">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((w) => (
                <tr key={w.id} data-testid={`weighing-row-${w.id}`} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-zinc-400 whitespace-nowrap">{formatDateTime(w.timestamp)}</td>
                  <td className="px-4 py-3 font-medium flex items-center gap-2"><Scale size={14} className="text-[#EF5A28]" />{w.product_name}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{formatWeight(w.weight, w.unit)}</td>
                  <td className="px-4 py-3"><MovementBadge type={w.movement_type} /></td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${w.stability_status === "STABLE" ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30"}`}>{w.stability_status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{w.device_id}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{w.operator || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border text-green-400 bg-green-500/10 border-green-500/30">{w.sync_status}</span>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="text-center text-zinc-600 py-10">No weighing events yet. Use the Edge Device App to send one.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
