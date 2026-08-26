import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { ArrowRight } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email: email.trim() });
      setResult(data);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  const inp = "w-full bg-zinc-900/70 border border-zinc-800 focus:border-[#EF5A28] focus:ring-1 focus:ring-[#EF5A28] rounded-md px-3.5 py-2.5 text-sm outline-none transition-colors";

  return (
    <div className="grain min-h-screen flex items-center justify-center bg-[#0B0B0C] text-white p-6">
      <div className="w-full max-w-sm animate-in-up relative z-10">
        <Link to="/"><Logo size={30} /></Link>
        <div className="micro-label mb-2 mt-10">Reset password</div>
        <h2 className="font-display text-2xl font-bold mb-8">Forgot your password?</h2>

        {result ? (
          <div data-testid="forgot-result" className="space-y-4">
            <p className="text-sm text-zinc-400 leading-relaxed">{result.message}</p>
            {result.reset_link && (
              <div className="border border-zinc-800/80 rounded-md p-3 bg-zinc-900/40 text-xs">
                <div className="micro-label mb-1.5">Prototype · email delivery mocked</div>
                <Link to={result.reset_link} data-testid="reset-link" className="text-[#EF5A28] hover:underline break-all">
                  Continue to reset password →
                </Link>
              </div>
            )}
            <Link to="/login" className="inline-block text-sm text-zinc-400 hover:text-white">← Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="micro-label block mb-2">Email</label>
              <input data-testid="forgot-email" type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)} className={inp} />
            </div>
            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</div>}
            <button data-testid="forgot-submit" type="submit" disabled={loading}
              className="w-full bg-[#EF5A28] hover:bg-[#D94B1C] disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              {loading ? "Sending…" : <>Send reset link <ArrowRight size={16} /></>}
            </button>
            <Link to="/login" className="inline-block text-sm text-zinc-400 hover:text-white">← Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}
