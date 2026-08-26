import Link from "next/link";
import { color, radius, text, space } from "./design";

/**
 * Rendered on auth routes when Clerk isn't configured for this deployment,
 * instead of letting Clerk's components throw and return a 500.
 *
 * A server component with no client dependencies, so it works even when
 * ClerkProvider is absent from the tree.
 */
export function AuthUnavailableNotice({ action }: { action: string }) {
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
          maxWidth: 440,
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
          {action} is temporarily unavailable
        </h1>
        <p style={{ fontSize: text.bodyLg, color: color.ink2, margin: `0 0 ${space[5]}px` }}>
          Authentication isn&apos;t configured for this deployment. Nothing is wrong with your
          account — please try again shortly.
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
