import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/auth/register", { name: form.name.trim(), email: form.email.trim(), password: form.password });
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
          <div className="mt-10" data-testid="register-success">
            <CheckCircle2 size={36} className="text-green-400 mb-4" />
            <h2 className="font-display text-2xl font-bold mb-2">Account created.</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your account is <span className="text-[#EF5A28]">pending admin approval</span>. An owner or
              manager will review it shortly — you'll be able to sign in once approved.
            </p>
            <Link to="/login" data-testid="go-to-login"
              className="inline-flex items-center gap-2 mt-6 bg-[#EF5A28] hover:bg-[#D94B1C] text-white font-medium px-4 py-2.5 rounded-md transition-all active:scale-[0.98]">
              Back to sign in <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            <div className="micro-label mb-2 mt-10">Create your account</div>
            <h2 className="font-display text-2xl font-bold mb-8">Join Re-Plate.</h2>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="micro-label block mb-2">Full name</label>
                <input data-testid="register-name" value={form.name} required
                  onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="micro-label block mb-2">Email</label>
                <input data-testid="register-email" type="email" value={form.email} required
                  onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="micro-label block mb-2">Password</label>
                <input data-testid="register-password" type="password" value={form.password} required
                  onChange={(e) => setForm({ ...form, password: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="micro-label block mb-2">Confirm password</label>
                <input data-testid="register-confirm" type="password" value={form.confirm} required
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={inp} />
              </div>
              {error && <div data-testid="register-error" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</div>}
              <button data-testid="register-submit" type="submit" disabled={loading}
                className="w-full bg-[#EF5A28] hover:bg-[#D94B1C] disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                {loading ? "Creating…" : <>Create account <ArrowRight size={16} /></>}
              </button>
            </form>
            <p className="text-sm text-zinc-500 mt-6">
              Already have an account? <Link to="/login" className="text-[#EF5A28] hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
