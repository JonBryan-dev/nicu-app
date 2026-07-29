"use client";
// /join?code=XXXXXX — the one-screen invite journey.
// The link carries the invite code, so a new family member just gives their
// name, email and a password. If the project requires email confirmation, a
// single emailed code step appears; existing accounts are detected and asked
// for their password instead. Role still derives from the code — never picked.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enablePush } from "@/lib/push";

type Mode = "details" | "code" | "existing" | "done";

function JoinInner() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<Mode>("details");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // already signed in with a profile? straight in
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .maybeSingle();
      if (prof) router.replace("/");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function joinNow(): Promise<boolean> {
    const { error } = await supabase.rpc("join_family", {
      p_code: code.trim(),
      p_display_name: name.trim(),
    });
    if (error) {
      if (error.message.includes("already in a family")) return true;
      setErr(
        error.message.includes("invalid invite code")
          ? "That invite code doesn't look right — check it with whoever sent it."
          : error.message
      );
      return false;
    }
    return true;
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!code.trim()) return setErr("Pop the invite code in.");
    if (!name.trim()) return setErr("Add your first name.");
    if (password.length < 8) return setErr("Password needs 8+ characters.");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      if (/already|registered/i.test(error.message)) return setMode("existing");
      return setErr(error.message);
    }
    // existing confirmed account: Supabase returns a user with no identities
    if (data.user && (data.user.identities?.length ?? 1) === 0) {
      setBusy(false);
      return setMode("existing");
    }
    if (data.session) {
      // no email confirmation required — join straight away
      const ok = await joinNow();
      setBusy(false);
      if (ok) setMode("done");
    } else {
      setBusy(false);
      setMode("code");
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const token = otp.replace(/\D/g, "");
    if (token.length < 6) return setErr("Copy the whole code from the email.");
    setBusy(true);
    let res = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "signup",
    });
    if (res.error) {
      res = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
    }
    if (res.error) {
      setBusy(false);
      return setErr("That code isn't right or has expired — try again or resend.");
    }
    const ok = await joinNow();
    setBusy(false);
    if (ok) setMode("done");
  }

  async function submitExisting(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      return setErr(
        error.message.includes("Invalid")
          ? "That password doesn't match this email. You can reset it from the sign-in page."
          : error.message
      );
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .maybeSingle();
    if (prof) {
      router.replace("/");
      router.refresh();
      return;
    }
    const ok = await joinNow();
    setBusy(false);
    if (ok) setMode("done");
  }

  async function enter() {
    const { data } = await supabase.auth.getUser();
    if (data.user && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      try {
        await enablePush(supabase, data.user.id);
      } catch {
        /* declined */
      }
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="overlay">
      <div className="card">
        <h2 style={{ textAlign: "center" }}>
          {mode === "done" ? "You're in 💛" : "You've been invited 💛"}
        </h2>

        {mode === "details" && (
          <form onSubmit={submitDetails}>
            <p className="note" style={{ textAlign: "center" }}>
              A private family space — three quick things and you&apos;re in.
            </p>
            {!params.get("code") && (
              <>
                <label htmlFor="j-code">Invite code</label>
                <input
                  id="j-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 4F7A2C"
                  autoCapitalize="characters"
                  required
                />
              </>
            )}
            <label htmlFor="j-name">Your first name</label>
            <input
              id="j-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandma Sue"
              required
            />
            <label htmlFor="j-email">Your email</label>
            <input
              id="j-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <label htmlFor="j-pw">Choose a password</label>
            <input
              id="j-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "One sec…" : "Join"}
              </button>
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                type="button"
                className="tiny"
                onClick={() => {
                  setErr("");
                  setMode("existing");
                }}
              >
                Already have an account? Log in
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}

        {mode === "code" && (
          <form onSubmit={submitCode}>
            <p className="note" style={{ textAlign: "center" }}>
              Last step — we&apos;ve emailed a code to <b>{email.trim()}</b>.
            </p>
            <label htmlFor="j-otp">Your code</label>
            <input
              id="j-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="12345678"
              style={{ textAlign: "center", letterSpacing: "0.3em", fontWeight: 700 }}
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Checking…" : "Finish joining"}
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}

        {mode === "existing" && (
          <form onSubmit={submitExisting}>
            <p className="note" style={{ textAlign: "center" }}>
              Log in with your email and password and we&apos;ll pop you into
              this family.
            </p>
            <label htmlFor="j-email2">Your email</label>
            <input
              id="j-email2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <label htmlFor="j-pw2">Password</label>
            <input
              id="j-pw2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "One sec…" : "Log in & join"}
              </button>
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                type="button"
                className="tiny"
                onClick={() => {
                  setErr("");
                  setMode("details");
                }}
              >
                New here? Create an account
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        )}

        {mode === "done" && (
          <div style={{ marginTop: 8 }}>
            {!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
              <p className="note" style={{ textAlign: "center" }}>
                Next, we&apos;ll ask to send notifications — it&apos;s how
                you&apos;ll hear about new updates the moment they happen.
              </p>
            )}
            <div style={{ textAlign: "center" }}>
              <button className="primary" onClick={enter}>
                Take me in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinInner />
    </Suspense>
  );
}
