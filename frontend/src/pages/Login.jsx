import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { formatApiError } from "@/lib/api";
import { ArrowRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("amit@chef-hire.in");
  const [password, setPassword] = useState("replate123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/app");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="grain min-h-screen flex bg-[#0B0B0C] text-white">
      {/* Brand panel */}
      <div className="hidden lg:flex w-[46%] flex-col justify-between p-12 border-r border-zinc-800/80 relative overflow-hidden">
        <Logo size={30} />
        <div className="relative z-10">
          <div className="micro-label mb-4 text-[#EF5A28]">Physical inventory intelligence</div>
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Kitchen intelligence<br />that <span className="text-[#EF5A28] italic">pays for itself</span>.
          </h1>
          <p className="text-zinc-400 mt-5 max-w-md text-sm leading-relaxed">
            Scale → Edge → Re-Plate. Every gram weighed becomes an auditable inventory movement with real ₹ impact.
          </p>
          <div className="grid grid-cols-3 gap-6 mt-10 max-w-sm">
            {[["₹80K", "avg saved / mo"], ["3.2×", "90-day ROI"], ["67%", "less waste"]].map(([v, l]) => (
              <div key={l}>
                <div className="font-mono font-bold text-2xl text-white">{v}</div>
                <div className="micro-label mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="micro-label">Re-Plate Demo Organisation · V0.1 Prototype</div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-sm animate-in-up">
          <div className="lg:hidden mb-8"><Logo size={28} /></div>
          <div className="micro-label mb-2">Operator sign in</div>
          <h2 className="font-display text-2xl font-bold mb-8">Welcome back.</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="micro-label block mb-2">Email</label>
              <input data-testid="login-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-zinc-900/70 border border-zinc-800 focus:border-[#EF5A28] focus:ring-1 focus:ring-[#EF5A28] rounded-md px-3.5 py-2.5 text-sm outline-none transition-colors" />
            </div>
            <div>
              <label className="micro-label block mb-2">Password</label>
              <input data-testid="login-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required
                className="w-full bg-zinc-900/70 border border-zinc-800 focus:border-[#EF5A28] focus:ring-1 focus:ring-[#EF5A28] rounded-md px-3.5 py-2.5 text-sm outline-none transition-colors" />
            </div>
            {error && <div data-testid="login-error" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</div>}
            <button data-testid="login-submit" type="submit" disabled={loading}
              className="w-full bg-[#EF5A28] hover:bg-[#D94B1C] disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              {loading ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="flex items-center justify-between mt-4 text-sm">
            <Link to="/forgot-password" data-testid="forgot-password-link" className="text-zinc-400 hover:text-white transition-colors">Forgot password?</Link>
            <Link to="/register" data-testid="register-link" className="text-[#EF5A28] hover:underline">Create account</Link>
          </div>

          <div className="mt-8 text-xs text-zinc-500 border border-zinc-800/80 rounded-md p-3 bg-zinc-900/40">
            <div className="micro-label mb-1.5">Demo access</div>
            amit@chef-hire.in · replate123 (Owner)
          </div>
        </div>
      </div>
    </div>
  );
}
