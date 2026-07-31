"use client";
// PowerPumpProvider — runs the one-hour power-pump session app-wide, above the
// tabs, so you can use the rest of the app while it runs. The clock is driven
// by wall-time (survives navigation, re-render, and reload), keeps the screen
// awake so it keeps ticking, chimes at each switch, and pushes the *other*
// parent at every phase change (the notify function excludes the actor, so the
// pumping parent gets the local chime and their partner gets the heads-up).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFamily } from "@/components/FamilyProvider";

type Phase = { type: "pump" | "rest"; secs: number };
const SEQUENCE: Phase[] = [
  { type: "pump", secs: 20 * 60 },
  { type: "rest", secs: 10 * 60 },
  { type: "pump", secs: 10 * 60 },
  { type: "rest", secs: 10 * 60 },
  { type: "pump", secs: 10 * 60 },
];
const TOTAL = SEQUENCE.reduce((a, p) => a + p.secs, 0);
// cumulative end (seconds) of each phase
const CUM = SEQUENCE.reduce<number[]>((acc, p) => {
  acc.push((acc[acc.length - 1] ?? 0) + p.secs);
  return acc;
}, []);
const KEY = "powerpump-v1";

type Session = { startedAt: number; pausedTotal: number; pausedAt: number | null; finished: boolean };

export const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function positionAt(elapsed: number): { index: number; remaining: number; done: boolean } {
  if (elapsed >= TOTAL) return { index: SEQUENCE.length - 1, remaining: 0, done: true };
  for (let i = 0; i < SEQUENCE.length; i++) {
    if (elapsed < CUM[i]) return { index: i, remaining: CUM[i] - elapsed, done: false };
  }
  return { index: SEQUENCE.length - 1, remaining: 0, done: true };
}

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

type Ctx = {
  active: boolean;
  finished: boolean;
  paused: boolean;
  expanded: boolean;
  phaseIndex: number;
  phaseType: "pump" | "rest";
  remaining: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  finishNow: () => void;
  dismiss: () => void;
  logSession: (ml: string) => Promise<void>;
  setExpanded: (b: boolean) => void;
};

const PPContext = createContext<Ctx | null>(null);
export const usePowerPump = () => {
  const c = useContext(PPContext);
  if (!c) throw new Error("usePowerPump outside provider");
  return c;
};

export default function PowerPumpProvider({ children }: { children: ReactNode }) {
  const { supabase, family, profile } = useFamily();

  const [active, setActive] = useState(false);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [remaining, setRemaining] = useState(SEQUENCE[0].secs);

  const sessionRef = useRef<Session | null>(null);
  const lastIndexRef = useRef(0);
  const finishedRef = useRef(false);
  const pausedRef = useRef(false);
  const acRef = useRef<AudioContext | null>(null);
  const wakeRef = useRef<{ release: () => void } | null>(null);

  const persist = (s: Session | null) => {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
  };
  const elapsedSecs = () => {
    const s = sessionRef.current;
    if (!s) return 0;
    const pausedNow = s.pausedAt ? Date.now() - s.pausedAt : 0;
    return Math.max(0, (Date.now() - s.startedAt - s.pausedTotal - pausedNow) / 1000);
  };

  const requestWake = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }).wakeLock;
      if (wl) wakeRef.current = await wl.request("screen");
    } catch {
      /* not supported / denied — timer still runs while visible */
    }
  }, []);
  const releaseWake = useCallback(() => {
    try {
      wakeRef.current?.release();
    } catch {
      /* already gone */
    }
    wakeRef.current = null;
  }, []);

  const notify = useCallback(
    (kind: "phase" | "done", index = 0) => {
      let title = "Power pump 💪";
      let body: string;
      if (kind === "done") {
        title = "Power pump done 💪";
        body = "A full hour — pop in what you collected.";
      } else {
        const ph = SEQUENCE[index];
        body = ph.type === "pump" ? `Pump now · ${ph.secs / 60} min` : `Rest now · feet up · ${ph.secs / 60} min`;
      }
      supabase
        .from("notifications")
        .insert({ family_id: family.id, recipient_role: "parent", actor_id: profile.id, title, body, url: "/feeds" });
    },
    [supabase, family.id, profile.id]
  );

  const recompute = useCallback(() => {
    const s = sessionRef.current;
    if (!s || finishedRef.current) return;
    const pos = positionAt(elapsedSecs());
    if (pos.done) {
      finishedRef.current = true;
      sessionRef.current = { ...s, finished: true };
      persist(sessionRef.current);
      setFinished(true);
      setRemaining(0);
      releaseWake();
      if (document.visibilityState === "visible") {
        chime(acRef.current, "done");
        notify("done");
      }
      return;
    }
    setRemaining(pos.remaining);
    if (pos.index !== lastIndexRef.current) {
      const jumped = pos.index - lastIndexRef.current;
      lastIndexRef.current = pos.index;
      setPhaseIndex(pos.index);
      // only announce a live, single-step switch — not phases skipped past
      // while the app was backgrounded
      if (jumped === 1 && document.visibilityState === "visible") {
        chime(acRef.current, "switch");
        notify("phase", pos.index);
      }
    }
  }, [notify, releaseWake]);

  // restore a session in progress (reload / reopened app)
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      /* private mode */
    }
    if (!raw) return;
    let s: Session;
    try {
      s = JSON.parse(raw) as Session;
    } catch {
      return;
    }
    // ignore anything older than a session could plausibly be
    if (!s.startedAt || Date.now() - s.startedAt > 3 * 3600 * 1000) {
      persist(null);
      return;
    }
    sessionRef.current = s;
    const pos = positionAt(elapsedSecs());
    lastIndexRef.current = pos.index;
    setActive(true);
    setExpanded(false);
    if (s.finished || pos.done) {
      finishedRef.current = true;
      setFinished(true);
      setRemaining(0);
      setPhaseIndex(SEQUENCE.length - 1);
    } else {
      pausedRef.current = !!s.pausedAt;
      setPaused(!!s.pausedAt);
      setPhaseIndex(pos.index);
      setRemaining(pos.remaining);
      if (!s.pausedAt) requestWake();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the ticking loop, plus re-sync + re-lock when the app returns to front
  useEffect(() => {
    if (!active || paused || finished) return;
    recompute();
    const id = setInterval(recompute, 250);
    const onWake = () => {
      if (document.visibilityState === "visible") {
        recompute();
        if (!pausedRef.current && !finishedRef.current) requestWake();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [active, paused, finished, recompute, requestWake]);

  const start = useCallback(() => {
    acRef.current = acRef.current ?? (typeof AudioContext !== "undefined" ? new AudioContext() : null);
    acRef.current?.resume?.();
    const s: Session = { startedAt: Date.now(), pausedTotal: 0, pausedAt: null, finished: false };
    sessionRef.current = s;
    persist(s);
    finishedRef.current = false;
    pausedRef.current = false;
    lastIndexRef.current = 0;
    setActive(true);
    setFinished(false);
    setPaused(false);
    setPhaseIndex(0);
    setRemaining(SEQUENCE[0].secs);
    setExpanded(true);
    requestWake();
  }, [requestWake]);

  const pause = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.pausedAt) return;
    s.pausedAt = Date.now();
    persist(s);
    pausedRef.current = true;
    setPaused(true);
    releaseWake();
  }, [releaseWake]);

  const resume = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !s.pausedAt) return;
    s.pausedTotal += Date.now() - s.pausedAt;
    s.pausedAt = null;
    persist(s);
    pausedRef.current = false;
    setPaused(false);
    requestWake();
    recompute();
  }, [recompute, requestWake]);

  const skip = useCallback(() => {
    const s = sessionRef.current;
    if (!s || finishedRef.current) return;
    const pos = positionAt(elapsedSecs());
    if (pos.done) return;
    // jump wall-time just past the end of the current phase
    s.startedAt -= (CUM[pos.index] - elapsedSecs()) * 1000 + 60;
    persist(s);
    recompute();
  }, [recompute]);

  const finishNow = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    finishedRef.current = true;
    sessionRef.current = { ...s, finished: true };
    persist(sessionRef.current);
    setFinished(true);
    setRemaining(0);
    setExpanded(true);
    releaseWake();
    chime(acRef.current, "done");
    notify("done");
  }, [notify, releaseWake]);

  const dismiss = useCallback(() => {
    sessionRef.current = null;
    finishedRef.current = false;
    pausedRef.current = false;
    lastIndexRef.current = 0;
    persist(null);
    releaseWake();
    setActive(false);
    setFinished(false);
    setPaused(false);
    setExpanded(false);
    setPhaseIndex(0);
    setRemaining(SEQUENCE[0].secs);
  }, [releaseWake]);

  const logSession = useCallback(
    async (mlStr: string) => {
      const s = sessionRef.current;
      const amount = mlStr ? parseInt(mlStr, 10) : null;
      await supabase.from("feeds").insert({
        family_id: family.id,
        fed_by: profile.id,
        started_at: new Date(s?.startedAt ?? Date.now()).toISOString(),
        ended_at: new Date().toISOString(),
        ml: amount != null && !isNaN(amount) ? amount : null,
        method: "pump",
        note: "Power pump 💪",
      });
      dismiss();
    },
    [supabase, family.id, profile.id, dismiss]
  );

  const value: Ctx = {
    active,
    finished,
    paused,
    expanded,
    phaseIndex,
    phaseType: SEQUENCE[phaseIndex].type,
    remaining,
    start,
    pause,
    resume,
    skip,
    finishNow,
    dismiss,
    logSession,
    setExpanded,
  };

  return (
    <PPContext.Provider value={value}>
      {children}
      {active && <PowerPumpUI />}
    </PPContext.Provider>
  );
}

// Drop-in for the Feeds pump card — starts a session, or reopens the running
// one. The session itself lives in the provider, so it outlives this button.
export function PowerPumpButton() {
  const pp = usePowerPump();
  if (pp.active) {
    return (
      <button type="button" className="ghost" onClick={() => pp.setExpanded(true)}>
        💪 {pp.finished ? "Finish up" : `Pumping · ${mmss(pp.remaining)}`}
      </button>
    );
  }
  return (
    <button type="button" className="ghost" onClick={pp.start}>
      💪 Power pump
    </button>
  );
}

function PowerPumpUI() {
  const pp = usePowerPump();
  const [ml, setMl] = useState("");
  const [busy, setBusy] = useState(false);

  if (!pp.expanded) {
    return (
      <button className="pp-mini" onClick={() => pp.setExpanded(true)} aria-label="Open power pump">
        <span className={`pp-mini-dot ${pp.phaseType}`} aria-hidden="true" />
        {pp.finished ? "Power pump done 💪" : `${pp.phaseType === "pump" ? "🥛 Pump" : "☕ Rest"} · ${mmss(pp.remaining)}`}
      </button>
    );
  }

  const doneFrac = 1 - pp.remaining / SEQUENCE[pp.phaseIndex].secs;
  const overall =
    (SEQUENCE.slice(0, pp.phaseIndex).reduce((a, x) => a + x.secs, 0) + SEQUENCE[pp.phaseIndex].secs * doneFrac) / TOTAL;
  const pumpsLeft = SEQUENCE.filter((x, i) => i >= pp.phaseIndex && x.type === "pump").length;

  return (
    <div className="overlay">
      <div className="card pp">
        {pp.finished ? (
          <>
            <h2 style={{ textAlign: "center" }}>Power pump done 💪</h2>
            <p className="note" style={{ textAlign: "center" }}>
              A full hour — brilliant. Pop in what you collected and it goes on today&apos;s tally.
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
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await pp.logSession(ml);
                  setBusy(false);
                  setMl("");
                }}
              >
                {busy ? "Saving…" : "Save session"}
              </button>
              <button className="ghost" style={{ flex: "0 0 auto" }} onClick={pp.dismiss}>
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`ppphase ${pp.phaseType}`}>
              {pp.phaseType === "pump" ? "🥛 Pump" : "☕ Rest — feet up"}
            </div>
            <div className="pptime">{mmss(pp.remaining)}</div>
            <p className="muted" style={{ textAlign: "center" }}>
              Step {pp.phaseIndex + 1} of {SEQUENCE.length}
              {pp.phaseType === "pump" && ` · ${pumpsLeft} pump${pumpsLeft > 1 ? "s" : ""} to go`}
            </p>
            <div className="progress" style={{ marginTop: 12 }}>
              <i style={{ width: `${Math.min(100, overall * 100)}%` }} />
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={pp.paused ? pp.resume : pp.pause}>
                {pp.paused ? "Resume" : "Pause"}
              </button>
              <button className="ghost" onClick={pp.skip}>
                Skip step
              </button>
              <button className="ghost" style={{ flex: "0 0 auto" }} onClick={pp.finishNow}>
                Finish
              </button>
            </div>
            <button className="pp-minimize" onClick={() => pp.setExpanded(false)}>
              ↓ Use the app — it keeps running
            </button>
          </>
        )}
      </div>
    </div>
  );
}
