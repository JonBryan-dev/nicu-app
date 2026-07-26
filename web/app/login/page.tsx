"use client";
// /login — magic-link sign in
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
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
          <form onSubmit={sendLink}>
            <p className="note" style={{ textAlign: "center" }}>
              A private space for our family. Sign in with your email — no
              password needed.
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
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send me a sign-in link"}
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
