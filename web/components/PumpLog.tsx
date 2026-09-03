"use client";
// PumpLog — the plain record: every pumping/expressing session, grouped by day,
// each day expandable to its times, amounts, left/right split and how long it
// took. Complements the trend (PumpHistory) and the day-overlay (PumpDays) with
// the actual numbers. Pulls pump-method feeds + quick-logged expressing.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtime } from "@/lib/useRealtime";

const DAYS_BACK = 21;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type Sess = {
  id: string;
  src: "feeds" | "expressing_logs"; // which table the row lives in
  time: Date;
  ml: number | null;
  left: number | null;
  right: number | null;
  mins: number | null;
};
type FeedRow = { id: string; started_at: string; ended_at: string | null; ml: number | null; ml_left: number | null; ml_right: number | null };
type ExRow = { id: string; ml: number; at: string };

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((+today - +date) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${WDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export default function PumpLog({ supabase, familyId }: { supabase: SupabaseClient; familyId: string }) {
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [expr, setExpr] = useState<ExRow[]>([]);

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (DAYS_BACK - 1));
    const iso = since.toISOString();
    const [fd, ex] = await Promise.all([
      supabase
        .from("feeds")
        .select("id, started_at, ended_at, ml, ml_left, ml_right")
        .eq("family_id", familyId)
        .eq("method", "pump")
        .gte("started_at", iso),
      supabase.from("expressing_logs").select("id, ml, at").eq("family_id", familyId).gte("at", iso),
    ]);
    setFeeds((fd.data as FeedRow[]) ?? []);
    setExpr((ex.data as ExRow[]) ?? []);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", familyId, load);
  useRealtime(supabase, "expressing_logs", familyId, load);

  // sessions saved to the wrong day (easy to do overnight) have no other
  // edit surface — the Feeds grid only covers today, so the fix lives here
  async function remove(s: Sess) {
    const when = `${dayLabel(dayKey(s.time)).toLowerCase()} ${hhmm(s.time)}`;
    if (!window.confirm(`Delete the ${when} session${s.ml != null ? ` (${s.ml} ml)` : ""}? This can't be undone.`)) return;
    await supabase.from(s.src).delete().eq("id", s.id);
    load();
  }

  const days = useMemo(() => {
    const map = new Map<string, Sess[]>();
    const push = (time: Date, s: Sess) => {
      const k = dayKey(time);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    };
    for (const f of feeds) {
      const t = new Date(f.started_at);
      const mins = f.ended_at ? Math.round((+new Date(f.ended_at) - +t) / 60000) : 0;
      push(t, { id: f.id, src: "feeds", time: t, ml: f.ml, left: f.ml_left, right: f.ml_right, mins: mins > 0 ? mins : null });
    }
    for (const r of expr)
      push(new Date(r.at), { id: r.id, src: "expressing_logs", time: new Date(r.at), ml: r.ml, left: null, right: null, mins: null });
    return Array.from(map.entries())
      .map(([key, ss]) => {
        ss.sort((a, b) => +b.time - +a.time);
        return { key, sessions: ss, total: ss.reduce((a, s) => a + (s.ml ?? 0), 0) };
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [feeds, expr]);

  if (!days.length) return null;

  return (
    <div className="card">
      <h2>Pumping log</h2>
      <p className="muted" style={{ marginBottom: 6 }}>
        Every session, day by day — tap a day for the times and amounts. ✕ removes one logged by mistake.
      </p>
      {days.map((d, i) => (
        <details key={d.key} className="logday" open={i === 0}>
          <summary>
            <span className="logday-date">{dayLabel(d.key)}</span>
            <span className="logday-total">
              {d.total} ml · {d.sessions.length} session{d.sessions.length > 1 ? "s" : ""}
            </span>
          </summary>
          <ul className="loglist">
            {d.sessions.map((s) => (
              <li key={s.id}>
                <span className="logt">{hhmm(s.time)}</span>
                <span className="logml">{s.ml != null ? `${s.ml} ml` : "—"}</span>
                {(s.left != null || s.right != null) && (
                  <span className="logside">L {s.left ?? 0} · R {s.right ?? 0}</span>
                )}
                {s.mins != null && <span className="logmin">{s.mins} min</span>}
                <button
                  type="button"
                  className="tiny"
                  style={{ marginLeft: s.mins != null ? undefined : "auto", flex: "0 0 auto" }}
                  onClick={() => remove(s)}
                  aria-label={`Delete the ${hhmm(s.time)} session`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
