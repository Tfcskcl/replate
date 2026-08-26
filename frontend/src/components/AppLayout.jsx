import React from "react";
import { NavLink, useNavigate, Outlet, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import {
  LayoutDashboard, Boxes, ArrowLeftRight, Package, Scale,
  Cpu, Store, Users, Building2, Smartphone, LogOut, ChevronDown,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/inventory", label: "Inventory", icon: Boxes },
  { to: "/app/movements", label: "Movements", icon: ArrowLeftRight },
  { to: "/app/products", label: "Products / SKU", icon: Package },
  { to: "/app/weighing-events", label: "Weighing Events", icon: Scale },
  { to: "/app/devices", label: "Devices", icon: Cpu },
  { to: "/app/outlets", label: "Outlets", icon: Store },
  { to: "/app/users", label: "Users & Roles", icon: Users },
  { to: "/app/organisation", label: "Organisation", icon: Building2 },
];

export default function AppLayout() {
  const { user, logout, outlets, selectedOutletId, selectOutlet } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="grain min-h-screen flex bg-[#0B0B0C] text-white">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-[#0C0C0E] sticky top-0 h-screen">
        <div className="px-5 h-16 flex items-center border-b border-zinc-800/80">
          <Link to="/app"><Logo size={30} /></Link>
        </div>

        <div className="px-3 py-4">
          <div className="micro-label px-2 mb-2">Active Outlet</div>
          <Select value={selectedOutletId} onValueChange={selectOutlet}>
            <SelectTrigger data-testid="outlet-switcher"
              className="bg-zinc-900/60 border-zinc-800 text-sm h-10">
              <SelectValue placeholder="Select outlet" />
            </SelectTrigger>
            <SelectContent className="bg-[#141416] border-zinc-800 text-white">
              {outlets.map((o) => (
                <SelectItem key={o.id} value={o.id} data-testid={`outlet-option-${o.id}`}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              data-testid={`nav-${label.toLowerCase().split(" ")[0]}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-[#EF5A28]/12 text-[#EF5A28] font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                }`
              }>
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-800/80">
          <Link to="/edge" data-testid="open-edge-app"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm bg-zinc-900/60 border border-zinc-800 text-zinc-200 hover:border-[#EF5A28]/40 transition-colors">
            <Smartphone size={17} className="text-[#EF5A28]" />
            Open Edge Device App
          </Link>
        </div>

        <div className="p-3 border-t border-zinc-800/80 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="micro-label truncate">{user?.role}</div>
          </div>
          <button onClick={onLogout} data-testid="logout-button"
            className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 relative z-10">
        {/* Mobile top bar */}
        <div className="md:hidden h-14 border-b border-zinc-800/80 flex items-center justify-between px-4 sticky top-0 bg-[#0B0B0C]/95 backdrop-blur z-20">
          <Logo size={22} />
          <div className="flex items-center gap-2">
            <Select value={selectedOutletId} onValueChange={selectOutlet}>
              <SelectTrigger className="h-8 text-xs bg-zinc-900/60 border-zinc-800 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#141416] border-zinc-800 text-white">
                {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={onLogout} className="p-2 text-zinc-400"><LogOut size={16} /></button>
          </div>
        </div>

        {/* Mobile nav strip */}
        <div className="md:hidden flex gap-1 overflow-x-auto px-3 py-2 border-b border-zinc-800/80 bg-[#0C0C0E]">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${
                  isActive ? "bg-[#EF5A28]/12 text-[#EF5A28]" : "text-zinc-400"
                }`}>
              <Icon size={14} /> {label.split(" ")[0]}
            </NavLink>
          ))}
        </div>

        <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
