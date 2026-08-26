import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  const inp = "w-full bg-zinc-900/70 border border-zinc-800 focus:border-[#EF5A28] focus:ring-1 focus:ring-[#EF5A28] rounded-md px-3.5 py-2.5 text-sm outline-none transition-colors";

  return (
    <div className="grain min-h-screen flex items-center justify-center bg-[#0B0B0C] text-white p-6">
      <div className="w-full max-w-sm animate-in-up relative z-10">
        <Link to="/"><Logo size={30} /></Link>

        {done ? (
          <div className="mt-10" data-testid="reset-success">
            <CheckCircle2 size={36} className="text-green-400 mb-4" />
            <h2 className="font-display text-2xl font-bold mb-2">Password updated.</h2>
            <p className="text-sm text-zinc-400">You can now sign in with your new password.</p>
            <Link to="/login" data-testid="reset-go-login"
              className="inline-flex items-center gap-2 mt-6 bg-[#EF5A28] hover:bg-[#D94B1C] text-white font-medium px-4 py-2.5 rounded-md transition-all active:scale-[0.98]">
              Sign in <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            <div className="micro-label mb-2 mt-10">Reset password</div>
            <h2 className="font-display text-2xl font-bold mb-8">Choose a new password.</h2>
            {!token && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 mb-4">Missing reset token. Request a new link.</div>}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="micro-label block mb-2">New password</label>
                <input data-testid="reset-password" type="password" value={password} required
                  onChange={(e) => setPassword(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="micro-label block mb-2">Confirm password</label>
                <input data-testid="reset-confirm" type="password" value={confirm} required
                  onChange={(e) => setConfirm(e.target.value)} className={inp} />
              </div>
              {error && <div data-testid="reset-error" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</div>}
              <button data-testid="reset-submit" type="submit" disabled={loading || !token}
                className="w-full bg-[#EF5A28] hover:bg-[#D94B1C] disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                {loading ? "Updating…" : <>Update password <ArrowRight size={16} /></>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
