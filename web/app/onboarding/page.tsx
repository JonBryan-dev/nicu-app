"use client";
// /onboarding — create a family (first parent) or join with an invite code.
// Role always derives from the code used — never user-selectable.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enablePush } from "@/lib/push";

type Mode = "pick" | "create" | "join";

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pick");
  const [name, setName] = useState("");
  const [baby, setBaby] = useState("");
  const [dob, setDob] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [codes, setCodes] = useState<{ parent: string; family: string } | null>(
    null
  );
  const [pushOffer, setPushOffer] = useState(false);

  useEffect(() => {
    // already onboarded? go home
    supabase
      .from("profiles")
      .select("id")
      .maybeSingle()
      .then(({ data }) => {
        if (data) router.replace("/");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.rpc("create_family", {
      p_baby_name: baby.trim(),
      p_baby_dob: dob,
      p_display_name: name.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setCodes({ parent: data.parent_code, family: data.family_code });
  }

  async function joinFamily(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("join_family", {
      p_code: code.trim(),
      p_display_name: name.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(
        error.message.includes("invalid invite code")
          ? "That code doesn't look right — check it and try again."
          : error.message
      );
      return;
    }
    setPushOffer(true);
  }

  async function offerPush() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      try {
        await enablePush(supabase, user.id);
      } catch {
        // declined or unsupported — fine
      }
    }
    router.replace("/");
    router.refresh();
  }

  // after create_family: show the two invite codes once
  if (codes) {
    return (
      <div className="overlay">
        <div className="card">
          <h2 style={{ textAlign: "center" }}>Your space is ready</h2>
          <p className="note" style={{ textAlign: "center" }}>
            Share these codes so others can join. They&apos;re also shown in
            the app any time you need them.
          </p>
          <label>Parent code — for {baby.trim() || "baby"}&apos;s other parent</label>
          <div className="code-box">{codes.parent}</div>
          <label>Family &amp; friends code</label>
          <div className="code-box">{codes.family}</div>
          <PushExplainer onDone={offerPush} />
        </div>
      </div>
    );
  }

  if (pushOffer) {
    return (
      <div className="overlay">
        <div className="card">
          <h2 style={{ textAlign: "center" }}>You&apos;re in</h2>
          <PushExplainer onDone={offerPush} />
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="card">
        <h2 style={{ textAlign: "center" }}>Welcome</h2>
        {mode === "pick" && (
          <>
            <p className="note" style={{ textAlign: "center" }}>
              Is this a new space, or are you joining one?
            </p>
            <div className="rolepick">
              <button onClick={() => setMode("create")}>
                Create your space
              </button>
              <button onClick={() => setMode("join")}>Join with a code</button>
            </div>
          </>
        )}
        {mode === "create" && (
          <form onSubmit={createFamily}>
            <p className="note" style={{ textAlign: "center" }}>
              For the first parent setting things up.
            </p>
            <label htmlFor="ob-baby">Baby&apos;s name</label>
            <input
              id="ob-baby"
              type="text"
              value={baby}
              onChange={(e) => setBaby(e.target.value)}
              placeholder="Her name"
              required
            />
            <label htmlFor="ob-dob">Date of birth</label>
            <input
              id="ob-dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
            <label htmlFor="ob-name">Your first name</label>
            <input
              id="ob-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jon"
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Let's go"}
              </button>
            </div>
            <button
              type="button"
              className="tiny"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => setMode("pick")}
            >
              Back
            </button>
            {err && <p className="err">{err}</p>}
          </form>
        )}
        {mode === "join" && (
          <form onSubmit={joinFamily}>
            <p className="note" style={{ textAlign: "center" }}>
              Enter the code you were sent — it knows who you are.
            </p>
            <label htmlFor="ob-code">Invite code</label>
            <input
              id="ob-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 4F7A2C"
              autoCapitalize="characters"
              required
            />
            <label htmlFor="ob-name2">Your first name</label>
            <input
              id="ob-name2"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandma Sue"
              required
            />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Joining…" : "Join"}
              </button>
            </div>
            <button
              type="button"
              className="tiny"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => setMode("pick")}
            >
              Back
            </button>
            {err && <p className="err">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

function PushExplainer({ onDone }: { onDone: () => void }) {
  const pushAvailable = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return (
    <div style={{ marginTop: 16 }}>
      {pushAvailable && (
        <p className="note" style={{ textAlign: "center" }}>
          Next, we&apos;ll ask to send notifications — it&apos;s how you&apos;ll
          hear about new updates, claimed jobs and visit bookings the moment
          they happen.
        </p>
      )}
      <div style={{ textAlign: "center" }}>
        <button className="primary" onClick={onDone}>
          {pushAvailable ? "Sounds good" : "Take me in"}
        </button>
      </div>
    </div>
  );
}
