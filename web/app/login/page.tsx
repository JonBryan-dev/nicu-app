"use client";
// /login — email + password by default (fast for returning family), with
// magic-link email as the fallback / first-time path.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setErr(
        error.message.includes("Invalid login credentials")
          ? "That email and password don't match. If you haven't set a password yet, use the sign-in link below."
          : error.message
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function sendLink() {
    if (!email.trim()) {
      setErr("Pop your email in first.");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setErr("Pop your email in first.");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="overlay">
      <div className="card">
        <h2 style={{ textAlign: "center" }}>Our NICU Journey</h2>
        {sent ? (
          <p className="note" style={{ textAlign: "center", marginTop: 8 }}>
            Check your email — we&apos;ve sent you a sign-in link. You can close
            this tab.
          </p>
        ) : (
          <form onSubmit={signInPassword}>
            <p className="note" style={{ textAlign: "center" }}>
              A private space for our family.
            </p>
            <label htmlFor="email">Your email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "One sec…" : "Sign in"}
              </button>
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                type="button"
                className="tiny"
                onClick={sendLink}
                disabled={busy}
              >
                First time, or no password yet? Email me a sign-in link
              </button>
              <br />
              <button
                type="button"
                className="tiny"
                onClick={forgotPassword}
                disabled={busy}
              >
                Forgotten your password?
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
