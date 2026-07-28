"use client";
// /login — email + password for returning members; a 6-digit emailed code for
// first-timers and forgotten passwords. Codes are typed into the app, so mail
// scanners can't consume them the way they can pre-click magic links.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "code" | "resetcode";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function needEmail(): boolean {
    if (!email.trim()) {
      setErr("Pop your email in first.");
      return true;
    }
    return false;
  }

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
          ? "That email and password don't match. If you haven't set a password yet, use the sign-in code below."
          : error.message
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function sendCode() {
    if (needEmail()) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setCode("");
    setMode("code");
  }

  async function sendResetCode() {
    if (needEmail()) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setCode("");
    setMode("resetcode");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setErr("That looks too short — copy the whole code from the email.");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: mode === "resetcode" ? "recovery" : "email",
    });
    setBusy(false);
    if (error) {
      setErr(
        error.message.toLowerCase().includes("expired") ||
          error.message.toLowerCase().includes("invalid")
          ? "That code isn't right or has expired — check the email, or resend a fresh one."
          : error.message
      );
      return;
    }
    router.replace(mode === "resetcode" ? "/reset-password" : "/");
    router.refresh();
  }

  return (
    <div className="overlay">
      <div className="card">
        <h2 style={{ textAlign: "center" }}>Our NICU Journey</h2>

        {mode === "password" && (
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
              <button type="button" className="tiny" onClick={sendCode} disabled={busy}>
                First time, or no password yet? Email me a sign-in code
              </button>
              <br />
              <button type="button" className="tiny" onClick={sendResetCode} disabled={busy}>
                Forgotten your password?
              </button>
              <br />
              <a className="tiny" href="/join" style={{ color: "var(--ink-soft)", fontWeight: 600, textDecoration: "none" }}>
                Have an invite code? Join here
              </a>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}

        {(mode === "code" || mode === "resetcode") && (
          <form onSubmit={verifyCode}>
            <p className="note" style={{ textAlign: "center" }}>
              We&apos;ve emailed a code to <b>{email.trim()}</b>.
              {mode === "resetcode" && " Enter it here, then choose a new password."}
            </p>
            <label htmlFor="otp">Your code</label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345678"
              style={{ textAlign: "center", letterSpacing: "0.3em", fontWeight: 700 }}
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Checking…" : "Continue"}
              </button>
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                type="button"
                className="tiny"
                onClick={mode === "resetcode" ? sendResetCode : sendCode}
                disabled={busy}
              >
                Resend the code
              </button>
              <br />
              <button
                type="button"
                className="tiny"
                onClick={() => {
                  setErr("");
                  setMode("password");
                }}
              >
                Back
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
