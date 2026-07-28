"use client";
// GrowthCard — weight & feeds log, kept separate from the story thread.
// Parents log today's weight (kg) + an optional feeds note; everyone sees a
// small weight line-chart. One row per day (upsert on family_id + log_date).
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate } from "@/lib/dates";
import type { CareLog } from "@/lib/types";

function WeightChart({ logs }: { logs: CareLog[] }) {
  const pts = logs
    .filter((l) => l.weight_grams != null)
    .map((l) => ({ date: l.log_date, g: l.weight_grams as number }));
  if (pts.length < 2) return null;

  const W = 320,
    H = 90,
    pad = 6;
  const gs = pts.map((p) => p.g);
  const min = Math.min(...gs),
    max = Math.max(...gs);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (g: number) => H - pad - ((g - min) / span) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.g).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Weight over time"
      style={{ display: "block", marginTop: 4 }}
    >
      <path d={d} fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.g)} r="3" fill="var(--sage)" />
      ))}
    </svg>
  );
}

export default function GrowthCard() {
  const { supabase, profile, family, isParent } = useFamily();
  const [logs, setLogs] = useState<CareLog[]>([]);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [feeds, setFeeds] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("care_logs")
      .select("*")
      .eq("family_id", family.id)
      .order("log_date");
    setLogs((data as CareLog[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "care_logs", family.id, load);

  const latest = [...logs].reverse().find((l) => l.weight_grams != null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const kg = parseFloat(weight);
    const grams = weight ? Math.round(kg * 1000) : null;
    if (grams !== null && (isNaN(grams) || grams < 200 || grams > 20000)) {
      setErr("Enter a weight in kg, e.g. 1.42");
      return;
    }
    if (grams === null && !feeds.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("care_logs").upsert(
      {
        family_id: family.id,
        logged_by: profile.id,
        log_date: todayKey(),
        weight_grams: grams,
        feeds_note: feeds.trim() || null,
      },
      { onConflict: "family_id,log_date" }
    );
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setWeight("");
    setFeeds("");
    load();
  }

  return (
    <div className="card">
      <h2>
        Growth{" "}
        {latest && (
          <span className="muted">· {(latest.weight_grams! / 1000).toFixed(3)} kg</span>
        )}
      </h2>
      {logs.length === 0 ? (
        <p className="muted">No weights logged yet.</p>
      ) : (
        <>
          <WeightChart logs={logs} />
          <p className="muted" style={{ marginTop: 2 }}>
            {logs.filter((l) => l.weight_grams != null).length} weigh-ins ·{" "}
            {fmtDate(logs[0].log_date)} → {fmtDate(logs[logs.length - 1].log_date)}
          </p>
        </>
      )}

      {isParent &&
        (open ? (
          <form onSubmit={save} style={{ marginTop: 10 }}>
            <div className="row wrap">
              <div>
                <label htmlFor="gc-w">Today&apos;s weight (kg)</label>
                <input
                  id="gc-w"
                  type="text"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="1.42"
                />
              </div>
              <div>
                <label htmlFor="gc-f">Feeds (note)</label>
                <input
                  id="gc-f"
                  type="text"
                  value={feeds}
                  onChange={(e) => setFeeds(e.target.value)}
                  placeholder="e.g. 8 × 35ml NGT"
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="primary" type="submit" disabled={busy}>
                Save today
              </button>
              <button
                type="button"
                className="ghost"
                style={{ flex: "0 0 auto" }}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        ) : (
          <button className="ghost" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
            Log today&apos;s weight &amp; feeds
          </button>
        ))}
    </div>
  );
}
