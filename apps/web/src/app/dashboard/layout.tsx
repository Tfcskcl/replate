"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "⬛" },
  { href: "/dashboard/outlets", label: "Outlets", icon: "🏪" },
  { href: "/dashboard/sop", label: "SOP Library", icon: "📋" },
  { href: "/dashboard/chefs", label: "Chefs", icon: "👨‍🍳" },
  { href: "/dashboard/location", label: "Location Intel", icon: "📍" },
  { href: "/dashboard/reports", label: "Reports", icon: "📊" },
  { href: "/dashboard/partners", label: "Partners", icon: "🤝" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 220 : 60,
        background: "#111111",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{
          padding: "20px 16px",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 32, height: 32,
            background: "#FF6B2B",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0,
          }}>R</div>
          {sidebarOpen && (
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>re-plate</span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 10px",
                  borderRadius: 8,
                  marginBottom: 2,
                  background: active ? "#FF6B2B" : "transparent",
                  color: active ? "#fff" : "#aaaaaa",
                  cursor: "pointer",
                  transition: "background 0.15s",
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div style={{
          padding: "12px 12px",
          borderTop: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          gap: 10,
          overflow: "hidden",
        }}>
          <div style={{
            width: 32, height: 32,
            background: "#333",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: "#aaa", flexShrink: 0,
          }}>
            {user?.firstName?.[0] ?? "U"}
          </div>
          {sidebarOpen && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.emailAddresses?.[0]?.emailAddress}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{
        flex: 1,
        background: "#f8f8f6",
        minHeight: "100vh",
        overflow: "auto",
      }}>
        {/* Topbar */}
        <div style={{
          background: "#ffffff",
          borderBottom: "1px solid #e5e5e5",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#555" }}
          >
            ☰
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <AlertBell />
            <span style={{ fontSize: 13, color: "#888" }}>re-plate.in</span>
          </div>
        </div>

        <div style={{ padding: "24px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

function AlertBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Fetch unacknowledged critical alert count
    fetch("/api/compliance/unacknowledged-count")
      .then(r => r.json())
      .then(d => setCount(d.count || 0))
      .catch(() => {});
  }, []);

  return (
    <div style={{ position: "relative", cursor: "pointer" }}>
      <span style={{ fontSize: 18 }}>🔔</span>
      {count > 0 && (
        <span style={{
          position: "absolute",
          top: -4, right: -4,
          background: "#E24B4A",
          color: "#fff",
          borderRadius: "50%",
          width: 16, height: 16,
          fontSize: 9, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{count > 9 ? "9+" : count}</span>
      )}
    </div>
  );
}
