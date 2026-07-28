"use client";
// /reset-password — landing page for the password recovery email.
// The recovery link signs the user in via /auth/callback, then arrives here
// to choose a new password.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setReady(!!data.user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Those don't match — try again.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="overlay">
      <div className="card">
        <h2 style={{ textAlign: "center" }}>Choose a new password</h2>
        {ready === null ? null : !ready ? (
          <p className="note" style={{ textAlign: "center", marginTop: 8 }}>
            That reset link didn&apos;t work or has expired.{" "}
            <a href="/login" style={{ color: "var(--rose-deep)" }}>
              Request a new one from the sign-in page.
            </a>
          </p>
        ) : (
          <form onSubmit={save}>
            <label htmlFor="np1">New password</label>
            <input
              id="np1"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
              required
            />
            <label htmlFor="np2">Type it again</label>
            <input
              id="np2"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Same again"
              autoComplete="new-password"
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save and sign in"}
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
