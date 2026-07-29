"use client";
// PowerPump — a guided one-hour power-pumping session that runs the classic
// supply-boost intervals for you: pump 20 · rest 10 · pump 10 · rest 10 ·
// pump 10. Auto-advances, buzzes/chimes at each switch, and logs the whole
// hour as a single pump session at the end so it feeds the schedule + supply.
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Phase = { type: "pump" | "rest"; label: string; secs: number };
const SEQUENCE: Phase[] = [
  { type: "pump", label: "Pump", secs: 20 * 60 },
  { type: "rest", label: "Rest", secs: 10 * 60 },
  { type: "pump", label: "Pump", secs: 10 * 60 },
  { type: "rest", label: "Rest", secs: 10 * 60 },
  { type: "pump", label: "Pump", secs: 10 * 60 },
];
const TOTAL_SECS = SEQUENCE.reduce((a, p) => a + p.secs, 0);

function chime(ac: AudioContext | null, kind: "switch" | "done") {
  try {
    if (navigator.vibrate) navigator.vibrate(kind === "done" ? [300, 120, 300, 120, 300] : [200, 100, 200]);
    if (!ac) return;
    const beeps = kind === "done" ? [660, 880, 990] : [880, 660];
    beeps.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ac.destination);
      const t = ac.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t);
      o.stop(t + 0.18);
    });
  } catch {
    /* audio blocked — vibration/visual still cover it */
  }
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PowerPump({
  supabase,
  familyId,
  profileId,
  onDone,
}: {
  supabase: SupabaseClient;
  familyId: string;
  profileId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState(0);
  const [remaining, setRemaining] = useState(SEQUENCE[0].secs);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ml, setMl] = useState("");
  const [busy, setBusy] = useState(false);

  const startedAt = useRef<Date | null>(null);
  const phaseEndsAt = useRef<number>(0);
  const acRef = useRef<AudioContext | null>(null);

  // countdown driven by absolute timestamps (survives re-render; recomputes on
  // resume so a glance-away doesn't drift)
  useEffect(() => {
    if (!open || paused || finished) return;
    const tick = () => {
      const left = Math.max(0, Math.round((phaseEndsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) advance();
    };
    const id = setInterval(tick, 250);
    const onWake = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, finished, phase]);

  function begin() {
    acRef.current =
      acRef.current ??
      (typeof AudioContext !== "undefined" ? new AudioContext() : null);
    acRef.current?.resume?.();
    startedAt.current = new Date();
    setPhase(0);
    setRemaining(SEQUENCE[0].secs);
    phaseEndsAt.current = Date.now() + SEQUENCE[0].secs * 1000;
    setPaused(false);
    setFinished(false);
    setOpen(true);
  }

  function advance() {
    setPhase((p) => {
      const next = p + 1;
      if (next >= SEQUENCE.length) {
        chime(acRef.current, "done");
        setFinished(true);
        return p;
      }
      chime(acRef.current, "switch");
      phaseEndsAt.current = Date.now() + SEQUENCE[next].secs * 1000;
      setRemaining(SEQUENCE[next].secs);
      return next;
    });
  }

  function togglePause() {
    setPaused((wasPaused) => {
      if (wasPaused) {
        phaseEndsAt.current = Date.now() + remaining * 1000;
        return false;
      }
      return true;
    });
  }

  function close() {
    setOpen(false);
    setFinished(false);
    setMl("");
  }

  async function logSession() {
    if (!startedAt.current) return close();
    setBusy(true);
    const amount = ml ? parseInt(ml, 10) : null;
    await supabase.from("feeds").insert({
      family_id: familyId,
      fed_by: profileId,
      started_at: startedAt.current.toISOString(),
      ended_at: new Date().toISOString(),
      ml: amount != null && !isNaN(amount) ? amount : null,
      method: "pump",
      note: "Power pump 💪",
    });
    setBusy(false);
    close();
    onDone();
  }

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={begin}>
        💪 Power pump
      </button>
    );
  }

  const p = SEQUENCE[phase];
  const doneSoFar =
    SEQUENCE.slice(0, phase).reduce((a, x) => a + x.secs, 0) +
    (p.secs - remaining);
  const pumpsLeft = SEQUENCE.filter((x, i) => i >= phase && x.type === "pump").length;

  return (
    <div className="overlay">
      <div className="card pp">
        {finished ? (
          <>
            <h2 style={{ textAlign: "center" }}>Power pump done 💪</h2>
            <p className="note" style={{ textAlign: "center" }}>
              A full hour — brilliant. Pop in what you collected and it goes on
              today&apos;s tally.
            </p>
            <label htmlFor="pp-ml">Total collected (ml)</label>
            <input
              id="pp-ml"
              type="text"
              inputMode="numeric"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
              placeholder="90"
            />
            <div className="row" style={{ marginTop: 14 }}>
              <button className="primary" onClick={logSession} disabled={busy}>
                {busy ? "Saving…" : "Save session"}
              </button>
              <button className="ghost" style={{ flex: "0 0 auto" }} onClick={close}>
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`ppphase ${p.type}`}>
              {p.type === "pump" ? "🥛 Pump" : "☕ Rest — feet up"}
            </div>
            <div className="pptime">{mmss(remaining)}</div>
            <p className="muted" style={{ textAlign: "center" }}>
              Step {phase + 1} of {SEQUENCE.length}
              {p.type === "pump" && ` · ${pumpsLeft} pump${pumpsLeft > 1 ? "s" : ""} to go`}
            </p>
            <div className="progress" style={{ marginTop: 12 }}>
              <i style={{ width: `${(doneSoFar / TOTAL_SECS) * 100}%` }} />
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={togglePause}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button className="ghost" onClick={advance}>
                Skip step
              </button>
              <button
                className="ghost"
                style={{ flex: "0 0 auto" }}
                onClick={() => setFinished(true)}
              >
                Finish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
