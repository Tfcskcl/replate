"use client";

import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  useUser,
} from "@clerk/nextjs";

/**
 * Clerk-optional auth primitives.
 *
 * re-plate.in serves the public marketing site and the authed app from one
 * domain, so a missing Clerk key would otherwise 500 the homepage — Clerk's
 * provider and hooks throw when `publishableKey` is absent.
 *
 * The rule these wrappers encode:
 *
 *   - Public surfaces DEGRADE. The marketing page renders, with sign-in
 *     shown as unavailable rather than crashing the route.
 *   - Authed surfaces FAIL CLOSED. `/dashboard` refuses to render at all
 *     rather than falling back to a signed-out-looking shell, so a config
 *     error can never be mistaken for a valid session. See
 *     app/dashboard/layout.tsx.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time, so this is a static boolean
 * in the client bundle, not a runtime lookup.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Renders children only for a signed-in user. Nothing when Clerk is absent. */
export function AuthedOnly({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return null;
  return <SignedIn>{children}</SignedIn>;
}

/**
 * Renders children for signed-out visitors. When Clerk is absent every
 * visitor is treated as a guest — correct for a public page, and safe
 * because this never grants access to anything.
 */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return <SignedOut>{children}</SignedOut>;
}

/**
 * Wraps a sign-in control. With Clerk configured this opens the modal;
 * without it the control is visibly present but inert and labelled, rather
 * than silently missing or linking to a route that would error.
 */
export function SignInAction({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) {
    return (
      <span
        aria-disabled="true"
        title="Sign-in is temporarily unavailable"
        style={{ opacity: 0.45, cursor: "not-allowed", display: "inline-block" }}
      >
        {children}
      </span>
    );
  }
  return <SignInButton mode="modal">{children}</SignInButton>;
}

/** Link to a route that requires auth. Inert when Clerk is absent. */
export function AuthedLink({
  href,
  children,
  style,
}: {
  href: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  if (!clerkEnabled) {
    return (
      <span
        aria-disabled="true"
        title="Sign-in is temporarily unavailable"
        style={{ ...style, opacity: 0.45, cursor: "not-allowed" }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} style={style}>
      {children}
    </Link>
  );
}

/**
 * `useUser` that returns null instead of throwing when Clerk is absent.
 *
 * The conditional hook call is safe here specifically because `clerkEnabled`
 * is a build-time constant, not state: it cannot change between renders, so
 * hook order is stable for the lifetime of the bundle. Do not make this
 * condition dynamic.
 */
export function useSafeUser() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const result = clerkEnabled ? useUser() : null;
  return result?.user ?? null;
}
