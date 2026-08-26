import { SignIn } from "@clerk/nextjs";
import { AuthUnavailableNotice } from "../../../lib/auth-unavailable";

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function Page() {
  if (!clerkConfigured) {
    return <AuthUnavailableNotice action="Sign-in" />;
  }
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <SignIn afterSignInUrl="/dashboard" />
    </div>
  );
}
