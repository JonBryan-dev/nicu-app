"use client";
// TopBreast — left vs right at a glance: today's split, the daily average across
// this week (shown next to today so you can see how today compares), and the
// running total collected. A trophy marks the week's front-runner. Gentle by
// design — both breasts are feeding the baby. Counts each side independently, so
// sessions with only one side logged still contribute.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtime } from "@/lib/useRealtime";

type Row = { started_at: string; ml_left: number | null; ml_right: number | null };
const WINDOW = 90; // days pulled (covers all data for now); "collected" totals these

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function TopBreast({ supabase, familyId }: { supabase: SupabaseClient; familyId: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (WINDOW - 1));
    const { data } = await supabase
      .from("feeds")
      .select("started_at, ml_left, ml_right")
      .eq("family_id", familyId)
      .eq("method", "pump")
      .gte("started_at", since.toISOString())
      .or("ml_left.not.is.null,ml_right.not.is.null");
    setRows((data as Row[]) ?? []);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", familyId, load);

  const stat = useMemo(() => {
    if (rows.length < 3) return null;
    const byDay = new Map<string, { l: number; r: number }>();
    for (const f of rows) {
      const k = localDay(f.started_at);
      const cur = byDay.get(k) ?? { l: 0, r: 0 };
      cur.l += f.ml_left ?? 0;
      cur.r += f.ml_right ?? 0;
      byDay.set(k, cur);
    }
    const today = byDay.get(localDay(new Date().toISOString())) ?? { l: 0, r: 0 };

    // daily average across the last 7 days that actually had sessions
    const week: { l: number; r: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const day = byDay.get(localDay(d.toISOString()));
      if (day) week.push(day);
    }
    const dn = week.length || 1;
    const avgL = Math.round(week.reduce((a, d) => a + d.l, 0) / dn);
    const avgR = Math.round(week.reduce((a, d) => a + d.r, 0) / dn);

    let totL = 0;
    let totR = 0;
    for (const d of byDay.values()) {
      totL += d.l;
      totR += d.r;
    }

    const hi = Math.max(avgL, avgR);
    const lo = Math.min(avgL, avgR);
    const pct = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : 0;
    const winner = hi === 0 || (hi - lo) / hi < 0.05 ? "tie" : avgL > avgR ? "left" : "right";
    return { today, avgL, avgR, totL, totR, winner, pct };
  }, [rows]);

  if (!stat) {
    return (
      <div className="card">
        <h2>Breast performance 🏆</h2>
        <p className="muted">
          Log a few pump sessions with a left/right split and this fills in — today, your weekly daily
          average, and the total collected, with a trophy for the front-runner.
        </p>
      </div>
    );
  }

  const { today, avgL, avgR, totL, totR, winner, pct } = stat;
  const w = (side: "left" | "right") => (winner === side ? "win" : "");
  const ml = (v: number) => `${v.toLocaleString()} ml`;
  const verdict =
    winner === "tie"
      ? "A matched pair — dead heat this week 🤝"
      : `${winner === "left" ? "Lefty" : "Righty"}’s your top performer this week, +${pct}% 🏆`;

  return (
    <div className="card">
      <h2>Breast performance 🏆</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Left vs right — today, your daily average this week, and the total collected. All in good fun. 💛
      </p>
      <div className="breast-grid">
        <div className="bg-h" />
        <div className={`bg-h ${w("left")}`}>Left {winner === "left" && "🏆"}</div>
        <div className={`bg-h ${w("right")}`}>Right {winner === "right" && "🏆"}</div>

        <div className="bg-rl">Today</div>
        <div className={w("left")}>{ml(today.l)}</div>
        <div className={w("right")}>{ml(today.r)}</div>

        <div className="bg-rl">Daily avg</div>
        <div className={w("left")}>{ml(avgL)}</div>
        <div className={w("right")}>{ml(avgR)}</div>

        <div className="bg-rl">Collected</div>
        <div className={w("left")}>{ml(totL)}</div>
        <div className={w("right")}>{ml(totR)}</div>
      </div>
      <p className="breast-verdict">{verdict}</p>
    </div>
  );
}
