"use client";
// PumpHistory — daily expressed totals over the last few weeks with an
// up/down trend, so a plateau or dip is visible at a glance. Sums pump
// sessions + quick-logged expressing per calendar day.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtime } from "@/lib/useRealtime";

const DAYS_BACK = 21;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Day = { date: string; ml: number };

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function label(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export default function PumpHistory({
  supabase,
  familyId,
}: {
  supabase: SupabaseClient;
  familyId: string;
}) {
  const [days, setDays] = useState<Day[]>([]);

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (DAYS_BACK - 1));
    const sinceIso = since.toISOString();
    const [fd, ex] = await Promise.all([
      supabase.from("feeds").select("ml, started_at").eq("family_id", familyId).gte("started_at", sinceIso),
      supabase.from("expressing_logs").select("ml, at").eq("family_id", familyId).gte("at", sinceIso),
    ]);
    const totals: Record<string, number> = {};
    for (const f of (fd.data as { ml: number | null; started_at: string }[]) ?? [])
      if (f.ml) totals[localDay(f.started_at)] = (totals[localDay(f.started_at)] ?? 0) + f.ml;
    for (const r of (ex.data as { ml: number; at: string }[]) ?? [])
      totals[localDay(r.at)] = (totals[localDay(r.at)] ?? 0) + r.ml;
    // fill every day in the window (0 for blanks) so gaps show honestly
    const out: Day[] = [];
    for (let i = 0; i < DAYS_BACK; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ date: key, ml: totals[key] ?? 0 });
    }
    setDays(out);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", familyId, load);
  useRealtime(supabase, "expressing_logs", familyId, load);

  const stats = useMemo(() => {
    // only days with any output — leading empty days before pumping began
    // shouldn't drag the trend down
    const active = days.filter((d, i) => d.ml > 0 || days.slice(0, i).some((x) => x.ml > 0));
    if (active.length < 3) return null;
    const ys = active.map((d) => d.ml);
    // least-squares slope (ml/day)
    const n = ys.length;
    const xm = (n - 1) / 2;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    ys.forEach((y, i) => {
      num += (i - xm) * (y - ym);
      den += (i - xm) ** 2;
    });
    const slope = den ? num / den : 0;
    // recent week vs the week before, for a human number
    const last7 = ys.slice(-7);
    const prev7 = ys.slice(-14, -7);
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
    const recentAvg = avg(last7);
    const prevAvg = avg(prev7);
    const wowDelta = prev7.length ? recentAvg - prevAvg : null;
    const dir =
      slope > 8 ? "rising" : slope < -8 ? "dipping" : "steady";
    return { active, slope, recentAvg, prevAvg, wowDelta, dir };
  }, [days]);

  if (!stats) {
    return (
      <div className="card">
        <h2>Pumping history</h2>
        <p className="muted">A few days of logs and the trend appears here.</p>
      </div>
    );
  }

  const { active, slope, recentAvg, wowDelta, dir } = stats;
  const ys = active.map((d) => d.ml);
  const W = 320, H = 120, pad = 8;
  const max = Math.max(...ys, 1);
  const min = Math.min(...ys);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (active.length - 1 || 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const line = active.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.ml).toFixed(1)}`).join(" ");
  // trend line endpoints from the regression
  const ym = ys.reduce((a, b) => a + b, 0) / ys.length;
  const xm = (active.length - 1) / 2;
  const trendY = (i: number) => ym + slope * (i - xm);
  const trendColor =
    dir === "rising" ? "var(--sage)" : dir === "dipping" ? "var(--rose-deep)" : "var(--ink-soft)";
  const dirLabel =
    dir === "rising" ? "↗ trending up" : dir === "dipping" ? "↘ trending down" : "→ holding steady";

  return (
    <div className="card">
      <h2>
        Pumping history{" "}
        <span className="badge" style={{ background: trendColor, color: "var(--on-accent)" }}>
          {dirLabel}
        </span>
      </h2>
      <p className="muted" style={{ marginBottom: 4 }}>
        7-day avg <b>{recentAvg} ml/day</b>
        {wowDelta != null && (
          <>
            {" · "}
            <span style={{ color: wowDelta >= 0 ? "var(--sage)" : "var(--rose-deep)", fontWeight: 700 }}>
              {wowDelta >= 0 ? "+" : ""}{wowDelta} ml
            </span>{" "}
            vs the week before
          </>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Daily expressed millilitres over time">
        <line x1={x(0)} y1={y(trendY(0))} x2={x(active.length - 1)} y2={y(trendY(active.length - 1))}
              stroke={trendColor} strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />
        <path d={line} fill="none" stroke="var(--sky)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {active.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.ml)} r="2.5" fill="var(--sky)" />
        ))}
      </svg>
      <p className="muted" style={{ marginTop: 2 }}>
        {label(active[0].date)} → {label(active[active.length - 1].date)}
      </p>
      {dir === "steady" && (
        <p className="muted" style={{ marginTop: 6 }}>
          Output&apos;s plateaued — a common point to try a power-pump session or
          two, and worth mentioning to your unit&apos;s lactation team.
        </p>
      )}
    </div>
  );
}
