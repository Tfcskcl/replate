import { authMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Clerk's middleware throws when its keys are missing, and this matcher
 * covers `/` — so an auth misconfiguration would 500 the public marketing
 * site, not just the app. When the keys are absent we pass requests through
 * untouched so public routes keep serving.
 *
 * This does NOT weaken protection of the app: with Clerk unconfigured there
 * is no session to verify in the first place, and `/dashboard` refuses to
 * render at all (see app/dashboard/layout.tsx) rather than showing a shell.
 * Access is denied by absence, not granted by it.
 */
const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

export default clerkConfigured
  ? authMiddleware({
      publicRoutes: ["/", "/api/auth/webhook", "/api/compliance/ingest"],
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
