import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, StatusPill } from "@/components/kit";
import { timeAgo } from "@/lib/format";
import { Scale, Camera, Cpu, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ICON = { SCALE: Scale, CAMERA: Camera, ANDROID_EDGE: Cpu };
const TYPE_LABEL = { SCALE: "Weighing Scale", CAMERA: "AI Camera", ANDROID_EDGE: "Android Edge" };

export default function Devices() {
  const { selectedOutletId } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "SCALE", status: "ACTIVE" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!selectedOutletId) return;
    api.get(`/devices?outlet_id=${selectedOutletId}`).then(({ data }) => setRows(data));
  }, [selectedOutletId]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name) { toast.error("Enter device name"); return; }
    setSaving(true);
    try {
      await api.post("/devices", { ...form, outlet_id: selectedOutletId });
      toast.success("Device registered"); setOpen(false); setForm({ name: "", type: "SCALE", status: "ACTIVE" }); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  const content = "bg-[#141416] border-zinc-800 text-white";

  return (
    <div>
      <PageHeader label="Edge Hardware Fleet" title="Devices">
        <button data-testid="add-device-button" onClick={() => setOpen(true)}
          className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
          <Plus size={16} /> Register Device
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((d) => {
          const Icon = ICON[d.type] || Cpu;
          const future = d.status === "FUTURE";
          return (
            <Card key={d.id} data-testid={`device-card-${d.id}`} className={`p-5 ${future ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${future ? "bg-zinc-800" : "bg-[#EF5A28]/12"}`}>
                  <Icon size={20} className={future ? "text-zinc-500" : "text-[#EF5A28]"} />
                </div>
                {future
                  ? <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border text-blue-400 bg-blue-500/10 border-blue-500/30">Future</span>
                  : <StatusPill online={d.connection_status === "ONLINE"} />}
              </div>
              <div className="font-medium">{d.name}</div>
              <div className="micro-label mt-1">{TYPE_LABEL[d.type]} · {d.id}</div>
              <div className="mt-4 pt-4 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                <div><div className="micro-label mb-0.5">Firmware</div><div className="font-mono text-zinc-300">{d.firmware || "—"}</div></div>
                <div><div className="micro-label mb-0.5">Last Seen</div><div className="font-mono text-zinc-300">{timeAgo(d.last_seen)}</div></div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={content}>
          <DialogHeader><DialogTitle className="font-display">Register Device</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="micro-label block mb-1.5">Name</label>
              <input data-testid="device-name" className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-[#EF5A28] rounded-md px-3 py-1.5 text-sm outline-none" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="micro-label block mb-1.5">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger data-testid="device-type" className="bg-zinc-900/60 border-zinc-800 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className={content}>
                  <SelectItem value="SCALE">Weighing Scale</SelectItem>
                  <SelectItem value="ANDROID_EDGE">Android Edge</SelectItem>
                  <SelectItem value="CAMERA">AI Camera (Future)</SelectItem>
                </SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <button data-testid="device-submit" onClick={submit} disabled={saving}
              className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60">
              {saving ? "Saving…" : "Register"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
