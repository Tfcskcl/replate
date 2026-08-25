"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const PIPELINE = [
  { label: "POS / ERP", sub: "sales, purchases" },
  { label: "Smart Scale", sub: "weight readings" },
  { label: "Jarvis", sub: "video analytics" },
];

const ENGINES = [
  { title: "Inventory Engine", desc: "Live stock levels from a signed transaction ledger — purchases, consumption, waste, adjustments." },
  { title: "Consumption Engine", desc: "Theoretical usage (recipe × sales) vs actual usage (inventory ledger), computed per outlet, per day." },
  { title: "Variance Intelligence", desc: "Classifies every meaningful gap as waste, leakage, or portion control — with a ₹ cost attached." },
  { title: "Profit Engine", desc: "Rolls revenue, COGS, and variance cost into one daily profit-impact number per outlet." },
];

const FEATURES = [
  { icon: "🔒", title: "SOP lock", desc: "Cryptographically locks kitchen SOPs so recipes can't drift undetected." },
  { icon: "📹", title: "Live monitoring", desc: "Watches kitchen operations via existing CCTV + DJI Action 2, no new hardware to run." },
  { icon: "🎓", title: "Auto training plans", desc: "Turns error patterns into chef training modules automatically." },
  { icon: "📍", title: "Layout intelligence", desc: "Heatmaps and FSSAI-aligned layout recommendations." },
  { icon: "📈", title: "Profit impact", desc: "Waste, leakage, and portion-control losses converted into a single ₹ number." },
  { icon: "🤝", title: "Partner network", desc: "60:40 revenue share, tracked and paid out per outlet, per partner." },
];

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px", ...style }}>
      {children}
    </section>
  );
}

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff" }}>
      {/* Nav */}
      <div style={{ borderBottom: "1px solid #eee" }}>
        <Section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#FF6B2B", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff" }}>R</div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>re-plate</span>
          </div>
          <SignedIn>
            <Link href="/dashboard" style={{ padding: "8px 18px", background: "#111", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Go to dashboard →
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button style={{ padding: "8px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </Section>
      </div>

      {/* Hero */}
      <Section style={{ padding: "72px 24px 56px", textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#FF6B2B", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 14px" }}>
          Hospitality Intelligence Layer
        </p>
        <h1 style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.15, margin: "0 0 18px" }}>
          Every ₹ your kitchen loses,<br />found and priced automatically.
        </h1>
        <p style={{ fontSize: 16, color: "#666", maxWidth: 620, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Re-plate locks your SOPs, watches your kitchen, and now ingests your POS/ERP, Smart Scale,
          and Jarvis video analytics to turn waste, leakage, and portion control into a single profit-impact number.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <SignedIn>
            <Link href="/dashboard" style={{ padding: "12px 28px", background: "#FF6B2B", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Go to dashboard →
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button style={{ padding: "12px 28px", background: "#FF6B2B", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Sign in to dashboard →
              </button>
            </SignInButton>
          </SignedOut>
          <a href="mailto:garima@re-plate.in" style={{ padding: "12px 28px", background: "#fff", color: "#111", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            Talk to us
          </a>
        </div>
      </Section>

      {/* Pipeline diagram */}
      <div style={{ background: "#f8f8f6", padding: "56px 0" }}>
        <Section>
          <h2 style={{ fontSize: 24, fontWeight: 600, textAlign: "center", margin: "0 0 8px" }}>How the intelligence layer works</h2>
          <p style={{ fontSize: 14, color: "#888", textAlign: "center", margin: "0 0 40px" }}>
            Three data sources, one pipeline, one number the whole team can act on.
          </p>

          {/* Sources */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 8 }}>
            {PIPELINE.map((p) => (
              <div key={p.label} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>{p.label}</p>
                <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>{p.sub}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 20, color: "#ccc", margin: "4px 0" }}>↓</div>
          <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "12px 16px", textAlign: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>Event ingestion → Re-plate data engine</p>
          </div>
          <div style={{ textAlign: "center", fontSize: 20, color: "#ccc", margin: "4px 0" }}>↓</div>

          {/* Engines */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 8 }}>
            {ENGINES.map((e) => (
              <div key={e.title} style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: "0 0 6px" }}>{e.title}</p>
                <p style={{ fontSize: 11, color: "#888", margin: 0, lineHeight: 1.5 }}>{e.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 20, color: "#ccc", margin: "4px 0" }}>↓</div>
          <div style={{ background: "#111", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>Re-plate dashboard · AI copilot</p>
          </div>
        </Section>
      </div>

      {/* Feature grid */}
      <Section style={{ padding: "64px 24px" }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, textAlign: "center", margin: "0 0 40px" }}>Everything in one platform</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 6px" }}>{f.title}</p>
              <p style={{ fontSize: 13, color: "#888", margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Partner programme */}
      <div style={{ background: "#f8f8f6", padding: "56px 0" }}>
        <Section style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 12px" }}>Partner programme</h2>
          <p style={{ fontSize: 14, color: "#666", maxWidth: 560, margin: "0 auto 24px", lineHeight: 1.6 }}>
            60% revenue share to partners, 40% to re-plate. ₹40,000 refundable security deposit.
            6–10 exclusive-territory partners per city.
          </p>
          <a href="mailto:garima@re-plate.in" style={{ padding: "10px 24px", background: "#FF6B2B", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Become a partner
          </a>
        </Section>
      </div>

      {/* Footer */}
      <Section style={{ padding: "32px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>© 2026 Hidden Flavour Pvt. Ltd. · re-plate.in</p>
        <a href="mailto:garima@re-plate.in" style={{ fontSize: 12, color: "#aaa" }}>garima@re-plate.in</a>
      </Section>
    </div>
  );
}
