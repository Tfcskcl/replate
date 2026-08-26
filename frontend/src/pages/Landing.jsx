import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import {
  ArrowRight, Scale, Smartphone, Server, Database, LayoutDashboard,
  Boxes, ArrowLeftRight, Cpu, Camera, ShoppingCart, ShieldCheck,
  Activity, IndianRupee, CheckCircle2,
} from "lucide-react";

const FLOW = [
  { icon: Scale, label: "Bluetooth Scale", sub: "Live weight" },
  { icon: Smartphone, label: "Android Edge", sub: "Stability engine" },
  { icon: Server, label: "Re-Plate API", sub: "Event engine" },
  { icon: Database, label: "Ledger + BI", sub: "₹ impact" },
];

const MODULES = [
  { icon: LayoutDashboard, t: "Dashboard", d: "Live ₹ inventory value, stock in/out, waste and device health at a glance." },
  { icon: Boxes, t: "Inventory", d: "On-hand stock with real-time valuation and low-stock alerts per outlet." },
  { icon: ArrowLeftRight, t: "Movement Ledger", d: "Every gram creates an immutable, auditable movement — never overwritten." },
  { icon: Scale, t: "Weighing Events", d: "Stable weights from the scale, associated to a product with one tap." },
  { icon: Cpu, t: "Devices", d: "Manage scales, edge controllers and future AI cameras across outlets." },
  { icon: ShieldCheck, t: "Roles & Audit", d: "Owner, Manager, Store Manager and Operator access — fully traceable." },
];

const STATS = [
  ["₹80K", "avg saved / month"],
  ["3.2×", "90-day ROI"],
  ["67%", "less food waste"],
];

export default function Landing() {
  const authed = !!localStorage.getItem("replate_token");
  const [w, setW] = useState(0);

  // subtle live weight animation for the hero mock
  useEffect(() => {
    let t = 3.25, dir = 1, id = setInterval(() => {
      t += dir * (Math.random() * 0.04);
      if (t > 3.28) dir = -1; if (t < 3.22) dir = 1;
      setW(+t.toFixed(3));
    }, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grain min-h-screen bg-[#0B0B0C] text-white overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/70 bg-[#0B0B0C]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo size={30} />
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
            <a href="#modules" className="hover:text-white transition-colors">Platform</a>
            <a href="#future" className="hover:text-white transition-colors">Roadmap</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="landing-signin"
              className="text-sm text-zinc-300 hover:text-white px-3 py-2 rounded-md transition-colors">Sign in</Link>
            <Link to={authed ? "/app" : "/login"} data-testid="landing-launch"
              className="text-sm font-medium bg-[#EF5A28] hover:bg-[#D94B1C] px-4 py-2 rounded-md flex items-center gap-1.5 transition-all active:scale-[0.98]">
              {authed ? "Dashboard" : "Launch app"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div className="animate-in-up">
          <div className="inline-flex items-center gap-2 border border-zinc-800 rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF5A28] pulse-dot" />
            <span className="micro-label !text-[10px]">Physical inventory intelligence · V0.1</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.02] tracking-tight">
            Kitchen intelligence<br />that <span className="text-[#EF5A28] italic">pays for itself</span>.
          </h1>
          <p className="text-zinc-400 mt-6 max-w-lg leading-relaxed">
            Re-Plate turns a Bluetooth weighing scale into an always-on inventory operator.
            Every stable weight becomes an auditable stock movement with real ₹ impact — from
            the physical kitchen straight to your dashboard.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to={authed ? "/app" : "/login"} data-testid="hero-launch"
              className="bg-[#EF5A28] hover:bg-[#D94B1C] font-medium px-5 py-3 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
              Open Dashboard <ArrowRight size={16} />
            </Link>
            <Link to="/edge" data-testid="hero-edge"
              className="border border-zinc-700 hover:border-[#EF5A28]/50 hover:bg-zinc-900/60 font-medium px-5 py-3 rounded-md flex items-center gap-2 transition-all">
              <Smartphone size={16} className="text-[#EF5A28]" /> Try the Edge App
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-6 mt-12 max-w-md">
            {STATS.map(([v, l]) => (
              <div key={l}>
                <div className="font-mono font-bold text-2xl md:text-3xl">{v}</div>
                <div className="micro-label mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero mock */}
        <div className="animate-in-up" style={{ animationDelay: "0.1s" }}>
          <div className="bg-[#121214] border border-zinc-800/80 rounded-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <span className="micro-label">re-plate · One N Only, Anand</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" /> Live
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[["Inventory", "₹38,319"], ["Stock Out", "₹1,800"], ["Waste", "₹520"]].map(([l, v], i) => (
                <div key={l} className="border border-zinc-800/80 rounded-lg p-3">
                  <div className="micro-label mb-2">{l}</div>
                  <div className={`font-mono font-bold text-lg ${i === 0 ? "text-[#EF5A28]" : ""}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="border border-zinc-800/80 rounded-lg p-4 mb-4 text-center bg-[#0E0E10]">
              <div className="micro-label mb-2">SCALE_001 · Current Weight</div>
              <div className="font-mono font-bold text-4xl tracking-tight">{w.toFixed(3)}<span className="text-lg text-zinc-500 ml-1">KG</span></div>
              <span className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-mono uppercase tracking-widest text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-400" /> Stable
              </span>
            </div>
            <div className="space-y-2">
              {[["Chicken Breast", "3.250 KG", "STOCK OUT", "₹910"], ["Paneer", "2.100 KG", "STOCK OUT", "₹672"], ["Rice", "10.000 KG", "STOCK IN", "₹620"]].map(([p, wt, t, v]) => (
                <div key={p} className="flex items-center justify-between text-sm border-b border-zinc-800/60 last:border-0 pb-2 last:pb-0">
                  <span>{p}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-zinc-400">{wt}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${t === "STOCK IN" ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-[#EF5A28] border-[#EF5A28]/30 bg-[#EF5A28]/10"}`}>{t}</span>
                    <span className="font-mono w-14 text-right">{v}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="border-y border-zinc-800/70 bg-[#0C0C0E]">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <div className="micro-label text-[#EF5A28] mb-3">The flow</div>
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-10">Physical world to business intelligence.</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {FLOW.map(({ icon: Icon, label, sub }, i) => (
              <div key={label} className="relative bg-[#121214] border border-zinc-800/80 rounded-lg p-5">
                <div className="w-11 h-11 rounded-lg bg-[#EF5A28]/12 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-[#EF5A28]" />
                </div>
                <div className="micro-label mb-1">Step {i + 1}</div>
                <div className="font-medium">{label}</div>
                <div className="text-sm text-zinc-500 mt-1">{sub}</div>
                {i < FLOW.length - 1 && <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-zinc-700" size={18} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="max-w-6xl mx-auto px-5 py-16">
        <div className="micro-label text-[#EF5A28] mb-3">Platform</div>
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-10">One operational control plane.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map(({ icon: Icon, t, d }) => (
            <div key={t} className="bg-[#121214] border border-zinc-800/80 rounded-lg p-6 hover:border-[#EF5A28]/40 transition-colors">
              <Icon size={22} className="text-[#EF5A28] mb-4" />
              <div className="font-display font-bold text-lg mb-2">{t}</div>
              <p className="text-sm text-zinc-400 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FUTURE */}
      <section id="future" className="border-y border-zinc-800/70 bg-[#0C0C0E]">
        <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="micro-label text-[#EF5A28] mb-3">Built to extend</div>
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-5">Camera & POS ready — without a rebuild.</h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              The event engine already speaks camera and sales events. As AI vision and POS
              come online, Re-Plate correlates a detected product with a scale reading and
              expected consumption — surfacing variance and ₹ leakage automatically.
            </p>
            <div className="space-y-3">
              {[[Camera, "Camera / Jarvis events", "Auto product recognition & zone tracking"],
                [ShoppingCart, "POS & recipe / BOM", "Expected vs actual consumption"],
                [IndianRupee, "Variance & ₹ impact", "Turn leakage into recovered profit"]].map(([Icon, t, d]) => (
                <div key={t} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800/60 border border-zinc-700 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-[#EF5A28]" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{t}</div>
                    <div className="text-xs text-zinc-500">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#121214] border border-zinc-800/80 rounded-xl p-6 font-mono text-sm">
            <div className="micro-label mb-4">Event correlation</div>
            {[["10:42:29", "CAMERA", "Chicken detected · Storage", Camera],
              ["10:42:31", "SCALE", "3.250 KG · stable", Scale],
              ["10:42:31", "RE-PLATE", "Chicken · 3.250 KG · STOCK OUT · ₹910", CheckCircle2]].map(([time, tag, txt, Icon], i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800/60 last:border-0">
                <Icon size={15} className={i === 2 ? "text-green-400 mt-0.5" : "text-zinc-500 mt-0.5"} />
                <div>
                  <span className="text-zinc-500">{time}</span>{" "}
                  <span className={i === 2 ? "text-green-400" : "text-[#EF5A28]"}>{tag}</span>
                  <div className="text-zinc-300 text-xs mt-0.5">{txt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-20 text-center">
        <Activity size={28} className="text-[#EF5A28] mx-auto mb-5" />
        <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
          See where your kitchen is leaking ₹.
        </h2>
        <p className="text-zinc-400 max-w-xl mx-auto mb-8">
          Connect a scale, weigh an ingredient, and watch it flow into an auditable ledger in seconds.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link to={authed ? "/app" : "/login"} data-testid="cta-launch"
            className="bg-[#EF5A28] hover:bg-[#D94B1C] font-medium px-6 py-3 rounded-md flex items-center gap-2 transition-all active:scale-[0.98]">
            Launch Re-Plate <ArrowRight size={16} />
          </Link>
          <Link to="/edge" className="border border-zinc-700 hover:border-[#EF5A28]/50 font-medium px-6 py-3 rounded-md transition-all">
            Open Edge Device App
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-800/70">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size={24} />
          <div className="micro-label">Re-Plate Demo Organisation · V0.1 Prototype</div>
        </div>
      </footer>
    </div>
  );
}
