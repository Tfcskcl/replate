import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card } from "@/components/kit";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "STORE_MANAGER", "OPERATOR"];
const ROLE_DESC = {
  OWNER: "Full access", ADMIN: "Full access",
  MANAGER: "Outlet + inventory + reports", STORE_MANAGER: "Inventory + stock movements",
  OPERATOR: "Weighing operations",
};

export default function Users() {
  const { outlets } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "replate123", role: "OPERATOR", outlet_id: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { api.get("/users").then(({ data }) => setRows(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name || !form.email) { toast.error("Name and email required"); return; }
    setSaving(true);
    try {
      await api.post("/users", { ...form, outlet_id: form.outlet_id || null });
      toast.success("User created"); setOpen(false);
      setForm({ name: "", email: "", password: "replate123", role: "OPERATOR", outlet_id: "" }); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  const content = "bg-[#141416] border-zinc-800 text-white";
  const inp = "w-full bg-zinc-900/60 border border-zinc-800 focus:border-[#EF5A28] rounded-md px-3 py-1.5 text-sm outline-none";

  return (
    <div>
      <PageHeader label="Access & Permissions" title="Users & Roles">
        <button data-testid="add-user-button" onClick={() => setOpen(true)}
          className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
          <Plus size={16} /> Add User
        </button>
      </PageHeader>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-800 text-left">
            {["Name", "Email", "Role", "Permissions", "Outlet"].map((h) => <th key={h} className="micro-label font-normal px-4 py-3">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.id}`} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3"><span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border text-[#EF5A28] bg-[#EF5A28]/10 border-[#EF5A28]/30">{u.role}</span></td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{ROLE_DESC[u.role]}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{u.outlet_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={content}>
          <DialogHeader><DialogTitle className="font-display">New User</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="micro-label block mb-1.5">Name</label><input data-testid="user-name" className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="micro-label block mb-1.5">Email</label><input data-testid="user-email" className={inp} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="micro-label block mb-1.5">Role</label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role" className="bg-zinc-900/60 border-zinc-800 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className={content}>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className="micro-label block mb-1.5">Outlet</label>
                <Select value={form.outlet_id} onValueChange={(v) => setForm({ ...form, outlet_id: v })}>
                  <SelectTrigger data-testid="user-outlet" className="bg-zinc-900/60 border-zinc-800 h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className={content}>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div><label className="micro-label block mb-1.5">Password</label><input data-testid="user-password" className={inp} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <button data-testid="user-submit" onClick={submit} disabled={saving} className="bg-[#EF5A28] hover:bg-[#D94B1C] text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60">{saving ? "Saving…" : "Create User"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
