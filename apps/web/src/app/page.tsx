"use client";

import { AuthedOnly, GuestOnly, SignInAction, AuthedLink } from "../lib/clerk-safe";
import { color, radius, text, space, MAX_WIDTH } from "../lib/design";

const SOURCES = [
  { label: "POS / ERP", sub: "sales, purchases" },
  { label: "Smart Scale", sub: "weight readings" },
  { label: "Vision", sub: "video analytics" },
];

const ENGINES = [
  {
    title: "Inventory Engine",
    desc: "Live stock levels from a signed transaction ledger — purchases, consumption, waste, adjustments.",
  },
  {
    title: "Consumption Engine",
    desc: "Theoretical usage (recipe × sales) vs actual usage (inventory ledger), computed per outlet, per day.",
  },
  {
    title: "Variance Intelligence",
    desc: "Classifies every meaningful gap as waste, leakage, or portion control — with a ₹ cost attached.",
  },
  {
    title: "Profit Engine",
    desc: "Rolls revenue, COGS, and variance cost into one daily profit-impact number per outlet.",
  },
];

const FEATURES = [
  { title: "SOP lock", desc: "Cryptographically locks kitchen SOPs so recipes can't drift undetected." },
  { title: "Live monitoring", desc: "Watches kitchen operations via existing CCTV + DJI Action 2, no new hardware to run." },
  { title: "Auto training plans", desc: "Turns error patterns into chef training modules automatically." },
  { title: "Layout intelligence", desc: "Heatmaps and FSSAI-aligned layout recommendations." },
  { title: "Profit impact", desc: "Waste, leakage, and portion-control losses converted into a single ₹ number." },
  { title: "Partner network", desc: "60:40 revenue share, tracked and paid out per outlet, per partner." },
];

function Section({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={{ maxWidth: MAX_WIDTH, margin: "0 auto", padding: `0 ${space[5]}px`, ...style }}>
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: text.caption,
        fontWeight: 600,
        color: color.orange,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

function PrimaryCTA({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "13px 26px",
        background: color.orange,
        color: color.surface,
        borderRadius: radius.md,
        fontSize: text.bodyLg,
        fontWeight: 600,
        cursor: "pointer",
        border: "none",
      }}
    >
      {children}
    </span>
  );
}

/** One node in the pipeline diagram. */
function Node({
  label,
  sub,
  tone = "light",
}: {
  label: string;
  sub?: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      style={{
        background: dark ? color.surfaceDark : color.surface,
        border: `1px solid ${dark ? color.surfaceDark : color.rule}`,
        borderRadius: radius.md,
        padding: `${space[3]}px ${space[4]}px`,
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: text.body,
          fontWeight: 600,
          color: dark ? color.surface : color.ink,
          margin: 0,
        }}
      >
        {label}
      </p>
      {sub && (
        <p style={{ fontSize: text.micro, color: color.ink3, margin: `${space[1]}px 0 0` }}>{sub}</p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <div
      aria-hidden="true"
      style={{ textAlign: "center", fontSize: text.h3, color: color.ink4, margin: `${space[2]}px 0` }}
    >
      ↓
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ background: color.surface, color: color.ink }}>
      {/* ── Nav ─────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${color.rule}`, background: color.surface }}>
        <Section
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${space[4]}px ${space[5]}px`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
            <img
              src="/logo-mark.png"
              alt=""
              style={{ width: 32, height: 32, objectFit: "contain" }}
            />
            <span style={{ fontWeight: 700, fontSize: text.lead, letterSpacing: "0.02em" }}>
              re-plate
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: space[5] }}>
            <a
              href="mailto:garima@re-plate.in"
              style={{
                fontSize: text.body,
                color: color.ink2,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Contact
            </a>
            <AuthedOnly>
              <AuthedLink
                href="/dashboard"
                style={{
                  padding: "9px 18px",
                  background: color.ink,
                  color: color.surface,
                  borderRadius: radius.md,
                  fontSize: text.body,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Dashboard →
              </AuthedLink>
            </AuthedOnly>
            <GuestOnly>
              <SignInAction>
                <button
                  style={{
                    padding: "9px 18px",
                    background: color.ink,
                    color: color.surface,
                    border: "none",
                    borderRadius: radius.md,
                    fontSize: text.body,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Sign in
                </button>
              </SignInAction>
            </GuestOnly>
          </div>
        </Section>
      </div>

      {/* ── Hero ────────────────────────────────────────── */}
      <Section style={{ padding: `${space[8]}px ${space[5]}px ${space[7]}px`, textAlign: "center" }}>
        <Eyebrow>Hospitality Intelligence Layer</Eyebrow>
        <h1
          style={{
            fontSize: text.display,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
            margin: `${space[4]}px 0 ${space[4]}px`,
          }}
        >
          Every ₹ your kitchen loses,
          <br />
          found and priced automatically.
        </h1>
        <p
          style={{
            fontSize: text.lead,
            color: color.ink2,
            maxWidth: "62ch",
            margin: `0 auto ${space[6]}px`,
            lineHeight: 1.65,
          }}
        >
          Re-plate locks your SOPs, watches your kitchen, and ingests your POS/ERP, smart scale, and
          video analytics to turn waste, leakage, and portion control into a single profit-impact
          number.
        </p>
        <div
          style={{
            display: "flex",
            gap: space[3],
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <AuthedOnly>
            <AuthedLink href="/dashboard" style={{ textDecoration: "none" }}>
              <PrimaryCTA>Go to dashboard →</PrimaryCTA>
            </AuthedLink>
          </AuthedOnly>
          <GuestOnly>
            <SignInAction>
              <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <PrimaryCTA>Sign in to dashboard →</PrimaryCTA>
              </button>
            </SignInAction>
          </GuestOnly>
          <a
            href="mailto:garima@re-plate.in"
            style={{
              padding: "13px 26px",
              background: color.surface,
              color: color.ink,
              border: `1px solid ${color.rule}`,
              borderRadius: radius.md,
              fontSize: text.bodyLg,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Talk to us
          </a>
        </div>
      </Section>

      {/* ── Pipeline ────────────────────────────────────── */}
      <div style={{ background: color.canvas, padding: `${space[8]}px 0`, borderTop: `1px solid ${color.rule}` }}>
        <Section>
          <div style={{ textAlign: "center", marginBottom: space[7] }}>
            <h2 style={{ fontSize: text.h2, fontWeight: 600, margin: `0 0 ${space[2]}px` }}>
              How the intelligence layer works
            </h2>
            <p style={{ fontSize: text.bodyLg, color: color.ink3, margin: 0 }}>
              Three data sources, one pipeline, one number the whole team can act on.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: space[3],
            }}
          >
            {SOURCES.map((s) => (
              <Node key={s.label} label={s.label} sub={s.sub} />
            ))}
          </div>

          <Arrow />
          <Node label="Event ingestion → Re-plate data engine" />
          <Arrow />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: space[3],
            }}
          >
            {ENGINES.map((e) => (
              <div
                key={e.title}
                style={{
                  background: color.surface,
                  border: `1px solid ${color.rule}`,
                  borderRadius: radius.md,
                  padding: space[4],
                }}
              >
                <p
                  style={{
                    fontSize: text.body,
                    fontWeight: 600,
                    color: color.ink,
                    margin: `0 0 ${space[2]}px`,
                  }}
                >
                  {e.title}
                </p>
                <p style={{ fontSize: text.micro, color: color.ink3, margin: 0, lineHeight: 1.55 }}>
                  {e.desc}
                </p>
              </div>
            ))}
          </div>

          <Arrow />
          <Node label="Re-plate dashboard · AI copilot" tone="dark" />
        </Section>
      </div>

      {/* ── Features ────────────────────────────────────── */}
      <Section style={{ padding: `${space[8]}px ${space[5]}px` }}>
        <h2
          style={{
            fontSize: text.h2,
            fontWeight: 600,
            textAlign: "center",
            margin: `0 0 ${space[7]}px`,
          }}
        >
          Everything in one platform
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: space[4],
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                border: `1px solid ${color.rule}`,
                borderRadius: radius.lg,
                padding: space[5],
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 3,
                  background: color.orange,
                  borderRadius: 2,
                  marginBottom: space[3],
                }}
              />
              <p
                style={{
                  fontSize: text.bodyLg,
                  fontWeight: 600,
                  color: color.ink,
                  margin: `0 0 ${space[2]}px`,
                }}
              >
                {f.title}
              </p>
              <p style={{ fontSize: text.body, color: color.ink3, margin: 0, lineHeight: 1.55 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Partner programme ───────────────────────────── */}
      <div style={{ background: color.canvas, padding: `${space[8]}px 0`, borderTop: `1px solid ${color.rule}` }}>
        <Section style={{ textAlign: "center" }}>
          <Eyebrow>Partner programme</Eyebrow>
          <h2 style={{ fontSize: text.h2, fontWeight: 600, margin: `${space[3]}px 0 ${space[3]}px` }}>
            Build a territory with us
          </h2>
          <p
            style={{
              fontSize: text.bodyLg,
              color: color.ink2,
              maxWidth: "56ch",
              margin: `0 auto ${space[5]}px`,
              lineHeight: 1.65,
            }}
          >
            60% revenue share to partners, 40% to re-plate. ₹40,000 refundable security deposit.
            6–10 exclusive-territory partners per city.
          </p>
          <a href="mailto:garima@re-plate.in" style={{ textDecoration: "none" }}>
            <PrimaryCTA>Become a partner</PrimaryCTA>
          </a>
        </Section>
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${color.rule}`, background: color.surface }}>
        <Section
          style={{
            padding: `${space[6]}px ${space[5]}px`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: space[3],
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
            <img src="/logo-mark.png" alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
            <p style={{ fontSize: text.caption, color: color.ink4, margin: 0 }}>
              © 2026 Hidden Flavour Pvt. Ltd. · re-plate.in
            </p>
          </div>
          <a
            href="mailto:garima@re-plate.in"
            style={{ fontSize: text.caption, color: color.ink4, textDecoration: "none" }}
          >
            garima@re-plate.in
          </a>
        </Section>
      </div>
    </div>
  );
}
