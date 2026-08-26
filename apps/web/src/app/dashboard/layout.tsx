"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clerkEnabled, useSafeUser } from "../../lib/clerk-safe";
import {
  LayoutGrid,
  Store,
  ClipboardList,
  MapPin,
  TrendingUp,
  FileBarChart,
  Handshake,
  Menu,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { color, radius, text, space } from "../../lib/design";

/**
 * Nav only lists routes that exist. New modules (Products, Inventory,
 * Movements, Devices, Weighing Events) get added here as they land —
 * a link to a route that doesn't exist yet is just a 404 for the operator.
 */
const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/outlets", label: "Outlets", icon: Store },
  { href: "/dashboard/sop", label: "SOP Library", icon: ClipboardList },
  { href: "/dashboard/location", label: "Location Intel", icon: MapPin },
  { href: "/dashboard/intelligence", label: "Intelligence", icon: TrendingUp },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/partners", label: "Partners", icon: Handshake },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useSafeUser();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fail closed. Without Clerk there is no session to verify, so the app
  // must refuse to render rather than present a shell that could be mistaken
  // for a signed-in state. The public site degrades; this does not.
  if (!clerkEnabled) {
    return <AuthUnavailable />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        style={{
          width: sidebarOpen ? 220 : 60,
          background: color.surfaceDark,
          color: color.surface,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s ease",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: `${space[5]}px ${space[4]}px`,
            borderBottom: `1px solid ${color.surfaceDark2}`,
            display: "flex",
            alignItems: "center",
            gap: space[3],
          }}
        >
          <img
            src="/logo-mark.png"
            alt=""
            style={{ width: 32, height: 32, flexShrink: 0, objectFit: "contain" }}
          />
          {sidebarOpen && (
            <span style={{ fontWeight: 700, fontSize: text.lead, letterSpacing: "0.02em" }}>
              re-plate
            </span>
          )}
        </div>

        <nav
          aria-label="Dashboard"
          style={{ flex: 1, padding: `${space[3]}px ${space[2]}px`, overflowY: "auto" }}
        >
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={sidebarOpen ? undefined : item.label}
                style={{ textDecoration: "none", display: "block" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space[3],
                    padding: `${space[3]}px ${space[3]}px`,
                    borderRadius: radius.md,
                    marginBottom: 2,
                    background: active ? color.orange : "transparent",
                    color: active ? color.surface : color.ink4,
                    fontSize: text.bodyLg,
                    fontWeight: active ? 600 : 400,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    transition: "background 0.15s",
                  }}
                >
                  <Icon size={17} strokeWidth={active ? 2.4 : 2} style={{ flexShrink: 0 }} />
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            padding: space[3],
            borderTop: `1px solid ${color.surfaceDark2}`,
            display: "flex",
            alignItems: "center",
            gap: space[3],
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: color.surfaceDark2,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: text.body,
              color: color.ink4,
              flexShrink: 0,
              fontWeight: 600,
            }}
          >
            {user?.firstName?.[0] ?? "U"}
          </div>
          {sidebarOpen && (
            <div style={{ overflow: "hidden" }}>
              <div
                style={{
                  fontSize: text.body,
                  color: color.surface,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.firstName} {user?.lastName}
              </div>
              <div
                style={{
                  fontSize: text.micro,
                  color: color.ink3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.emailAddresses?.[0]?.emailAddress}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <main style={{ flex: 1, background: color.canvas, minHeight: "100vh", overflow: "auto" }}>
        <div
          style={{
            background: color.surface,
            borderBottom: `1px solid ${color.rule}`,
            padding: `${space[3]}px ${space[5]}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarOpen}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: color.ink2,
              display: "flex",
              alignItems: "center",
              padding: space[1],
            }}
          >
            <Menu size={18} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: space[4] }}>
            <AlertBell />
            <span style={{ fontSize: text.body, color: color.ink3 }}>re-plate.in</span>
          </div>
        </div>

        <div style={{ padding: space[5] }}>{children}</div>
      </main>
    </div>
  );
}

/**
 * Shown instead of the app when Clerk is not configured. Deliberately plain
 * and explicit: this is an operator-facing failure, not a customer-facing
 * page, and it should be obvious that the cause is configuration rather than
 * a permissions problem with their account.
 */
function AuthUnavailable() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: color.canvas,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space[5],
      }}
    >
      <div
        style={{
          maxWidth: 460,
          background: color.surface,
          border: `1px solid ${color.rule}`,
          borderRadius: radius.lg,
          padding: space[6],
        }}
      >
        <img
          src="/logo-mark.png"
          alt=""
          style={{ width: 32, height: 32, objectFit: "contain", marginBottom: space[4] }}
        />
        <h1 style={{ fontSize: text.h3, fontWeight: 600, margin: `0 0 ${space[3]}px` }}>
          Dashboard unavailable
        </h1>
        <p style={{ fontSize: text.bodyLg, color: color.ink2, margin: `0 0 ${space[4]}px` }}>
          Authentication isn&apos;t configured for this deployment, so the dashboard can&apos;t
          verify who you are. Nothing is wrong with your account.
        </p>
        <p style={{ fontSize: text.body, color: color.ink3, margin: `0 0 ${space[5]}px` }}>
          If you manage this deployment: the Clerk environment variables are missing for this
          environment.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: color.ink,
            color: color.surface,
            borderRadius: radius.md,
            fontSize: text.body,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ← Back to re-plate.in
        </Link>
      </div>
    </div>
  );
}

function AlertBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Unacknowledged critical alerts. Fails quietly — the backend may not be
    // reachable, and a broken badge shouldn't break the shell.
    fetch("/api/compliance/unacknowledged-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCount(d?.count ?? 0))
      .catch(() => {});
  }, []);

  const label = count > 0 ? `${count} unacknowledged alerts` : "No unacknowledged alerts";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }} title={label}>
      <Bell size={18} style={{ color: color.ink2 }} aria-label={label} />
      {count > 0 && (
        <span
          className="rp-nums"
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            background: color.bad,
            color: color.surface,
            borderRadius: "50%",
            minWidth: 16,
            height: 16,
            fontSize: 9,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </div>
  );
}
