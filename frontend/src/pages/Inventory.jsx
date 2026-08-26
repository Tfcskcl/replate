import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card } from "@/components/kit";
import { formatINR, formatINRPrecise, formatWeight } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

export default function Inventory() {
  const { selectedOutletId } = useAuth();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!selectedOutletId) return;
    api.get(`/inventory?outlet_id=${selectedOutletId}`).then(({ data }) => setRows(data));
  }, [selectedOutletId]);

  const totalValue = rows.reduce((s, r) => s + r.stock_value, 0);

  return (
    <div>
      <PageHeader label="On-hand Stock & Valuation" title="Inventory">
        <div className="text-right">
          <div className="micro-label">Total Value</div>
          <div className="font-mono font-bold text-xl text-[#EF5A28]">{formatINR(totalValue)}</div>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                {["Product", "Category", "Current Stock", "Cost", "Stock Value", "Minimum", "Today", ""].map((h, i) => (
                  <th key={i} className="micro-label font-normal px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((r) => (
                <tr key={r.id} data-testid={`inventory-row-${r.id}`} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.category}</td>
                  <td className="px-4 py-3 font-mono">{formatWeight(r.current_stock, r.unit)}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">₹{r.cost_per_unit}/{r.unit}</td>
                  <td className="px-4 py-3 font-mono">{formatINRPrecise(r.stock_value)}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500">{r.minimum_stock} {r.unit}</td>
                  <td className={`px-4 py-3 font-mono ${r.today_movement < 0 ? "text-[#EF5A28]" : r.today_movement > 0 ? "text-green-400" : "text-zinc-600"}`}>
                    {r.today_movement > 0 ? "+" : ""}{r.today_movement.toFixed(3)}
                  </td>
                  <td className="px-4 py-3">
                    {r.low_stock && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                        <AlertTriangle size={11} /> Low
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
