import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Card } from "@/components/kit";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function Outlets() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", address: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { api.get("/outlets").then(({ data }) => setRows(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name) { toast.error("Enter outlet name"); return; }
    setSaving(true);
    try {
      await api.post("/outlets", { ...form });
      toast.success("Outlet created"); setOpen(false); setForm({ name: "", city: "", address: "" }); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  const inp = "w-full bg-zinc-900/60 border border-zinc-800 focus:border-[#EF5A28] rounded-md px-3 py-1.5 text-sm outline-none";

  return (
    <div>
      <PageHeader label="Multi-location Network" title="Outlets">
        <button data-testid="add-outlet-button" onClick={() => setOpen(true)}
          className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
          <Plus size={16} /> Add Outlet
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((o) => (
          <Card key={o.id} data-testid={`outlet-card-${o.id}`} className="p-5">
            <div className="micro-label text-[#EF5A28] mb-2">{o.code}</div>
            <div className="font-display text-lg font-bold">{o.name}</div>
            <div className="flex items-center gap-1.5 text-sm text-zinc-400 mt-1"><MapPin size={13} />{o.city || "—"}</div>
            <div className="mt-4 pt-4 border-t border-zinc-800/80">
              <div className="micro-label mb-2">Zones</div>
              <div className="flex flex-wrap gap-1.5">
                {(o.zones || []).map((z) => (
                  <span key={z} className="text-xs px-2 py-0.5 rounded bg-zinc-800/60 border border-zinc-700 text-zinc-300">{z}</span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#141416] border-zinc-800 text-white">
          <DialogHeader><DialogTitle className="font-display">New Outlet</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="micro-label block mb-1.5">Name</label><input data-testid="outlet-name" className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="micro-label block mb-1.5">City</label><input data-testid="outlet-city" className={inp} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><label className="micro-label block mb-1.5">Address</label><input data-testid="outlet-address" className={inp} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <button data-testid="outlet-submit" onClick={submit} disabled={saving} className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60">{saving ? "Saving…" : "Create Outlet"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
