import React from "react";

export function PageHeader({ label, title, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 animate-in-up">
      <div>
        {label && <div className="micro-label mb-1.5">{label}</div>}
        <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-white">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`bg-[#121214] border border-zinc-800/80 rounded-lg ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, accent = false, testid }) {
  return (
    <Card className="p-5 hover:border-zinc-700/80 transition-colors" data-testid={testid}>
      <div className="micro-label mb-3">{label}</div>
      <div className={`font-mono font-bold tracking-tight text-2xl md:text-[28px] leading-none ${accent ? "text-[#EF5A28]" : "text-white"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-500 mt-2 font-mono">{sub}</div>}
    </Card>
  );
}

export function MovementBadge({ type }) {
  const styles = {
    STOCK_IN: "text-green-400 bg-green-500/10 border-green-500/30",
    STOCK_OUT: "text-[#EF5A28] bg-[#EF5A28]/10 border-[#EF5A28]/30",
    WASTE: "text-red-400 bg-red-500/10 border-red-500/30",
    ADJUSTMENT: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    TRANSFER_IN: "text-green-300 bg-green-500/10 border-green-500/30",
    TRANSFER_OUT: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider font-semibold ${styles[type] || "text-zinc-400 bg-zinc-800 border-zinc-700"}`}>
      {(type || "").replace("_", " ")}
    </span>
  );
}

export function StatusPill({ online, labelOnline = "Online", labelOffline = "Offline" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider font-semibold ${
      online ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-zinc-500 bg-zinc-800/60 border-zinc-700"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-green-400 pulse-dot" : "bg-zinc-600"}`} />
      {online ? labelOnline : labelOffline}
    </span>
  );
}
