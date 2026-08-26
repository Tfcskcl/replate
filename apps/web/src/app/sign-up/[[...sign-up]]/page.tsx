import { SignUp } from "@clerk/nextjs";
import { AuthUnavailableNotice } from "../../../lib/auth-unavailable";

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function Page() {
  if (!clerkConfigured) {
    return <AuthUnavailableNotice action="Sign-up" />;
  }
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <SignUp afterSignUpUrl="/dashboard" />
    </div>
  );
}
