import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card } from "@/components/kit";
import { Building2, Store, Layers, Cpu } from "lucide-react";

export default function Organisation() {
  const { outlets } = useAuth();
  const [org, setOrg] = useState(null);
  const [counts, setCounts] = useState({ users: 0, products: 0, devices: 0 });

  useEffect(() => {
    api.get("/organisation").then(({ data }) => setOrg(data));
    Promise.all([api.get("/users"), api.get("/products"), api.get("/devices")])
      .then(([u, p, d]) => setCounts({ users: u.data.length, products: p.data.length, devices: d.data.length }));
  }, []);

  const zones = outlets.reduce((s, o) => s + (o.zones?.length || 0), 0);

  return (
    <div>
      <PageHeader label="Account" title="Organisation" />

      <Card className="p-6 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg bg-[#EF5A28]/12 flex items-center justify-center">
            <Building2 size={26} className="text-[#EF5A28]" />
          </div>
          <div>
            <div className="font-display text-2xl font-bold">{org?.name || "—"}</div>
            <div className="micro-label mt-1">Currency: {org?.currency || "INR"} · ID: {org?.id}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          [Store, "Outlets", outlets.length], [Layers, "Zones", zones],
          [Cpu, "Devices", counts.devices], [Building2, "Users", counts.users],
        ].map(([Icon, label, val]) => (
          <Card key={label} className="p-5">
            <Icon size={18} className="text-[#EF5A28] mb-3" />
            <div className="font-mono font-bold text-2xl">{val}</div>
            <div className="micro-label mt-1">{label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="micro-label mb-4">Hierarchy</div>
        <div className="font-mono text-sm text-zinc-300 leading-loose">
          <div>Organisation — <span className="text-white">{org?.name}</span></div>
          {outlets.map((o) => (
            <div key={o.id} className="pl-6 border-l border-zinc-800 ml-1">
              <span className="text-[#EF5A28]">↳</span> Outlet — {o.name}
              <div className="pl-6 text-zinc-500 text-xs">{(o.zones || []).join(" · ")}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
