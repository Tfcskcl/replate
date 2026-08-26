import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card } from "@/components/kit";
import { formatINRPrecise } from "@/lib/format";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

const empty = { name: "", category: "", unit: "KG", opening_stock: "", minimum_stock: "", cost_per_unit: "", active: true };

export default function Products() {
  const { selectedOutletId } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!selectedOutletId) return;
    api.get(`/products?outlet_id=${selectedOutletId}`).then(({ data }) => setRows(data));
  }, [selectedOutletId]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ name: p.name, category: p.category, unit: p.unit, opening_stock: p.opening_stock,
      minimum_stock: p.minimum_stock, cost_per_unit: p.cost_per_unit, active: p.active });
    setOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, {
          name: form.name, category: form.category, unit: form.unit,
          minimum_stock: parseFloat(form.minimum_stock), cost_per_unit: parseFloat(form.cost_per_unit), active: form.active,
        });
        toast.success("Product updated");
      } else {
        await api.post("/products", {
          name: form.name, category: form.category, unit: form.unit, base_unit: form.unit,
          opening_stock: parseFloat(form.opening_stock || 0), minimum_stock: parseFloat(form.minimum_stock || 0),
          cost_per_unit: parseFloat(form.cost_per_unit || 0), active: form.active, outlet_id: selectedOutletId,
        });
        toast.success("Product created");
      }
      setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const inp = "w-full bg-zinc-900/60 border border-zinc-800 focus:border-[#EF5A28] rounded-md px-3 py-1.5 text-sm outline-none";

  return (
    <div>
      <PageHeader label="SKU Master" title="Products">
        <button data-testid="add-product-button" onClick={openNew}
          className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
          <Plus size={16} /> Add Product
        </button>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-left">
              {["Product", "Category", "Unit", "Current", "Minimum", "Cost / Unit", "Status", ""].map((h) => (
                <th key={h} className="micro-label font-normal px-4 py-3">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((p) => (
                <tr key={p.id} data-testid={`product-row-${p.id}`} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.category}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">{p.unit}</td>
                  <td className="px-4 py-3 font-mono">{p.current_stock.toFixed(3)}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500">{p.minimum_stock}</td>
                  <td className="px-4 py-3 font-mono">{formatINRPrecise(p.cost_per_unit)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${p.active ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-zinc-500 bg-zinc-800 border-zinc-700"}`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button data-testid={`edit-product-${p.id}`} onClick={() => openEdit(p)} className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#141416] border-zinc-800 text-white">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="micro-label block mb-1.5">Name</label>
              <input data-testid="product-name" className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="micro-label block mb-1.5">Category</label>
                <input data-testid="product-category" className={inp} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              <div><label className="micro-label block mb-1.5">Unit</label>
                <input data-testid="product-unit" className={inp} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="micro-label block mb-1.5">Opening</label>
                <input data-testid="product-opening" type="number" step="0.001" disabled={!!editing} className={`${inp} disabled:opacity-50`} value={form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} /></div>
              <div><label className="micro-label block mb-1.5">Minimum</label>
                <input data-testid="product-minimum" type="number" step="0.001" className={inp} value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} /></div>
              <div><label className="micro-label block mb-1.5">₹ / Unit</label>
                <input data-testid="product-cost" type="number" step="0.01" className={inp} value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="product-active" />
              <span className="text-sm text-zinc-300">Active</span>
            </div>
          </div>
          <DialogFooter>
            <button data-testid="product-submit" onClick={submit} disabled={saving}
              className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60">
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Product"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
