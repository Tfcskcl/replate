import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatCard, Card, MovementBadge, StatusPill } from "@/components/kit";
import { formatINR, formatWeight, formatTime, timeAgo } from "@/lib/format";
import { Cpu, Scale, Camera, AlertTriangle } from "lucide-react";

const DEVICE_ICON = { SCALE: Scale, CAMERA: Camera, ANDROID_EDGE: Cpu };

export default function Dashboard() {
  const { selectedOutletId } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!selectedOutletId) return;
    api.get(`/dashboard/summary?outlet_id=${selectedOutletId}`).then(({ data }) => setData(data));
  }, [selectedOutletId]);

  if (!data) return <div className="text-zinc-500 text-sm py-20 text-center font-mono">Loading operations…</div>;

  return (
    <div>
      <PageHeader label="Operations Overview" title="Dashboard" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard testid="stat-inventory-value" label="Total Inventory Value" value={formatINR(data.total_inventory_value)} sub={`${data.product_count} active SKUs`} accent />
        <StatCard testid="stat-stock-in" label="Today's Stock In" value={formatINR(data.today_stock_in)} />
        <StatCard testid="stat-stock-out" label="Today's Stock Out" value={formatINR(data.today_stock_out)} />
        <StatCard testid="stat-waste" label="Today's Waste" value={formatINR(data.today_waste)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard testid="stat-low-stock" label="Low Stock Items" value={data.low_stock_count} />
        <StatCard testid="stat-devices" label="Devices Online" value={`${data.device_online}/${data.device_total}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent movements */}
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="micro-label">Recent Movements</div>
            <Link to="/app/movements" className="text-xs text-[#EF5A28] hover:underline font-mono">VIEW ALL →</Link>
          </div>
          <div className="divide-y divide-zinc-800/80">
            {data.recent_movements.map((m) => (
              <div key={m.id} data-testid={`dash-movement-${m.id}`} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.product_name}</div>
                  <div className="micro-label mt-0.5">{formatTime(m.timestamp)} · {m.source}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-sm">{Math.abs(m.delta).toFixed(3)} {m.unit}</span>
                  <MovementBadge type={m.movement_type} />
                  <span className="font-mono text-sm text-zinc-400 w-16 text-right">{formatINR(m.financial_impact)}</span>
                </div>
              </div>
            ))}
            {!data.recent_movements.length && <div className="py-8 text-center text-zinc-600 text-sm">No movements yet.</div>}
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Devices */}
          <Card className="p-5">
            <div className="micro-label mb-4">Device Status</div>
            <div className="space-y-3">
              {data.devices.map((d) => {
                const Icon = DEVICE_ICON[d.type] || Cpu;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon size={16} className="text-zinc-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm truncate">{d.name}</div>
                        <div className="micro-label">{d.id}</div>
                      </div>
                    </div>
                    <StatusPill online={d.connection_status === "ONLINE"} />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Low stock */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} className="text-amber-400" />
              <div className="micro-label">Low Stock</div>
            </div>
            <div className="space-y-2.5">
              {data.low_stock.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-mono text-amber-400">{formatWeight(p.current_stock, p.unit)}</span>
                </div>
              ))}
              {!data.low_stock.length && <div className="text-sm text-zinc-600">All items above minimum. ✓</div>}
            </div>
          </Card>
        </div>
      </div>

      {/* Recent weighings */}
      <Card className="p-5 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="micro-label">Recent Weighing Events</div>
          <Link to="/app/weighing-events" className="text-xs text-[#EF5A28] hover:underline font-mono">VIEW ALL →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.recent_weighings.map((w) => (
            <div key={w.id} className="border border-zinc-800/80 rounded-md p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{w.product_name}</span>
                <MovementBadge type={w.movement_type} />
              </div>
              <div className="font-mono font-bold text-lg mt-1">{formatWeight(w.weight, w.unit)}</div>
              <div className="micro-label mt-1">{w.device_id} · {timeAgo(w.timestamp)}</div>
            </div>
          ))}
          {!data.recent_weighings.length && <div className="text-sm text-zinc-600 py-4">No weighing events yet.</div>}
        </div>
      </Card>
    </div>
  );
}
