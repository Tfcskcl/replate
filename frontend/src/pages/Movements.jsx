import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, MovementBadge } from "@/components/kit";
import { formatINRPrecise, formatDateTime } from "@/lib/format";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "WASTE", "TRANSFER_IN", "TRANSFER_OUT"];
const SOURCES = ["MANUAL", "BLUETOOTH_SCALE", "CAMERA", "POS"];

export default function Movements() {
  const { selectedOutletId } = useAuth();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ product_id: "", movement_type: "", source: "", date_from: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: "", movement_type: "STOCK_IN", note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!selectedOutletId) return;
    const p = new URLSearchParams({ outlet_id: selectedOutletId });
    Object.entries(filters).forEach(([k, v]) => v && p.append(k, v));
    api.get(`/inventory/movements?${p}`).then(({ data }) => setRows(data));
  }, [selectedOutletId, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (selectedOutletId) api.get(`/products?outlet_id=${selectedOutletId}`).then(({ data }) => setProducts(data));
  }, [selectedOutletId]);

  const submit = async () => {
    if (!form.product_id || !form.quantity) { toast.error("Select product and quantity"); return; }
    setSaving(true);
    try {
      await api.post("/inventory/movements", {
        outlet_id: selectedOutletId, product_id: form.product_id,
        quantity: parseFloat(form.quantity), movement_type: form.movement_type,
        source: "MANUAL", note: form.note,
      });
      toast.success("Movement recorded");
      setOpen(false); setForm({ product_id: "", quantity: "", movement_type: "STOCK_IN", note: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const sel = "bg-zinc-900/60 border-zinc-800 h-9 text-sm";
  const content = "bg-[#141416] border-zinc-800 text-white";

  return (
    <div>
      <PageHeader label="Immutable Audit Ledger" title="Inventory Movements">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid="new-movement-button" className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
              <Plus size={16} /> New Movement
            </button>
          </DialogTrigger>
          <DialogContent className={content}>
            <DialogHeader><DialogTitle className="font-display">Record Manual Movement</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="micro-label block mb-1.5">Product</label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger data-testid="movement-product" className={sel}><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent className={content}>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="micro-label block mb-1.5">Type</label>
                  <Select value={form.movement_type} onValueChange={(v) => setForm({ ...form, movement_type: v })}>
                    <SelectTrigger data-testid="movement-type" className={sel}><SelectValue /></SelectTrigger>
                    <SelectContent className={content}>
                      {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="micro-label block mb-1.5">Quantity</label>
                  <input data-testid="movement-quantity" type="number" step="0.001" value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-[#EF5A28] rounded-md px-3 py-1.5 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="micro-label block mb-1.5">Reference / Note</label>
                <input data-testid="movement-note" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-[#EF5A28] rounded-md px-3 py-1.5 text-sm outline-none" />
              </div>
            </div>
            <DialogFooter>
              <button data-testid="movement-submit" onClick={submit} disabled={saving}
                className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60">
                {saving ? "Saving…" : "Record Movement"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filters.product_id || "all"} onValueChange={(v) => setFilters({ ...filters, product_id: v === "all" ? "" : v })}>
          <SelectTrigger data-testid="filter-product" className={`${sel} w-40`}><SelectValue placeholder="All Products" /></SelectTrigger>
          <SelectContent className={content}>
            <SelectItem value="all">All Products</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.movement_type || "all"} onValueChange={(v) => setFilters({ ...filters, movement_type: v === "all" ? "" : v })}>
          <SelectTrigger data-testid="filter-type" className={`${sel} w-40`}><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent className={content}>
            <SelectItem value="all">All Types</SelectItem>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.source || "all"} onValueChange={(v) => setFilters({ ...filters, source: v === "all" ? "" : v })}>
          <SelectTrigger data-testid="filter-source" className={`${sel} w-40`}><SelectValue placeholder="All Sources" /></SelectTrigger>
          <SelectContent className={content}>
            <SelectItem value="all">All Sources</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <input type="date" data-testid="filter-date" value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          className="bg-zinc-900/60 border border-zinc-800 rounded-md px-3 h-9 text-sm outline-none text-zinc-300" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                {["Time", "Product", "Qty", "Type", "Source", "Device", "User", "Value"].map((h) => (
                  <th key={h} className="micro-label font-normal px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((m) => (
                <tr key={m.id} data-testid={`movement-row-${m.id}`} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-zinc-400 whitespace-nowrap">{formatDateTime(m.timestamp)}</td>
                  <td className="px-4 py-3 font-medium">{m.product_name}</td>
                  <td className={`px-4 py-3 font-mono ${m.delta < 0 ? "text-[#EF5A28]" : "text-green-400"}`}>
                    {m.delta > 0 ? "+" : ""}{m.delta.toFixed(3)} {m.unit}
                  </td>
                  <td className="px-4 py-3"><MovementBadge type={m.movement_type} /></td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{m.source}</td>
                  <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{m.device_id || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{m.user_name || "—"}</td>
                  <td className="px-4 py-3 font-mono">{formatINRPrecise(m.financial_impact)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="text-center text-zinc-600 py-10">No movements match filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
