/**
 * Typed mirror of the CSS custom properties in app/globals.css.
 *
 * The app styles overwhelmingly via inline `style={{}}` objects, which
 * cannot read CSS variables ergonomically for computed values. This module
 * lets that code reference the same tokens without a rewrite, so new work
 * is consistent while existing pages migrate incrementally.
 *
 * Keep in sync with globals.css. Values are the brand's existing colours —
 * de-duplicated, not redesigned.
 */

export const color = {
  orange: "#FF6B2B",
  orangeDeep: "#EB6834",
  orangeTint: "#FFF7F4",

  ink: "#111111",
  ink2: "#555555",
  ink3: "#888888",
  ink4: "#AAAAAA",

  surface: "#FFFFFF",
  canvas: "#F8F8F6",
  surfaceDark: "#111111",
  surfaceDark2: "#2A2A2A",

  rule: "#E5E5E5",
  ruleSoft: "#F0F0F0",

  good: "#16A34A",
  goodBg: "#DCFCE7",
  warn: "#D97706",
  warnBg: "#FEF3C7",
  bad: "#DC2626",
  badBg: "#FEE2E2",
  info: "#2563EB",
  infoBg: "#DBEAFE",
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;

export const text = {
  micro: 11,
  caption: 12,
  body: 13,
  bodyLg: 14,
  lead: 16,
  h3: 20,
  h2: 24,
  h1: 32,
  display: 44,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

export const shadow = {
  sm: "0 1px 2px rgba(17, 17, 17, 0.04)",
  md: "0 2px 8px rgba(17, 17, 17, 0.06)",
} as const;

export const MAX_WIDTH = 1080;

/** Severity → colour pair. Replaces the ad-hoc maps duplicated across pages. */
export const severity = {
  critical: { fg: color.bad, bg: color.badBg, label: "critical" },
  warning: { fg: color.warn, bg: color.warnBg, label: "warning" },
  info: { fg: color.info, bg: color.infoBg, label: "info" },
  good: { fg: color.good, bg: color.goodBg, label: "ok" },
} as const;

export type SeverityKey = keyof typeof severity;

/** ₹ formatting, Indian digit grouping. */
export function inr(value: number, opts: { decimals?: boolean } = {}): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(value);
}

/** Weight formatting — always 3 decimals, matching scale precision (3.250 KG). */
export function kg(value: number): string {
  return `${value.toFixed(3)} KG`;
}
