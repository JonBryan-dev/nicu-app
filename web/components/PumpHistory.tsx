"use client";
// PumpHistory — expressed output over the last few weeks, framed to encourage.
// Shows a smoothed 3-day average (raw days as faint dots) on a zero-based axis
// so normal wobble looks like normal wobble, plus the numbers worth feeling
// good about: total collected, a typical day, the best day, sessions logged.
// A real sustained dip is surfaced gently — never in alarm-red — with one
// concrete, no-guilt thing to try. Sums pump sessions + quick-logged expressing.
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
function vol(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${Math.round(ml)} ml`;
}

export default function PumpHistory({
  supabase,
  familyId,
}: {
  supabase: SupabaseClient;
  familyId: string;
}) {
  const [days, setDays] = useState<Day[]>([]);
  const [sessions, setSessions] = useState(0);

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
    let count = 0;
    for (const f of (fd.data as { ml: number | null; started_at: string }[]) ?? [])
      if (f.ml) { totals[localDay(f.started_at)] = (totals[localDay(f.started_at)] ?? 0) + f.ml; count++; }
    for (const r of (ex.data as { ml: number; at: string }[]) ?? [])
      if (r.ml) { totals[localDay(r.at)] = (totals[localDay(r.at)] ?? 0) + r.ml; count++; }
    // fill every day in the window (0 for blanks) so gaps show honestly
    const out: Day[] = [];
    for (let i = 0; i < DAYS_BACK; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ date: key, ml: totals[key] ?? 0 });
    }
    setDays(out);
    setSessions(count);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", familyId, load);
  useRealtime(supabase, "expressing_logs", familyId, load);

  const stats = useMemo(() => {
    // start from the first day with any output — empty days before pumping
    // began shouldn't count against her
    const firstIdx = days.findIndex((d) => d.ml > 0);
    if (firstIdx === -1) return null;
    const active = days.slice(firstIdx);
    if (active.length < 3) return null;
    const ys = active.map((d) => d.ml);

    // 3-day trailing average — the line people actually feel, minus the noise
    const smooth = ys.map((_, i) => {
      const from = Math.max(0, i - 2);
      const w = ys.slice(from, i + 1);
      return w.reduce((a, b) => a + b, 0) / w.length;
    });

    const total = ys.reduce((a, b) => a + b, 0);
    const bestIdx = ys.reduce((bi, v, i) => (v > ys[bi] ? i : bi), 0);
    const best = { ml: ys[bestIdx], date: active[bestIdx].date };
    const daysLogged = ys.filter((v) => v > 0).length;
    const typical = Math.round(smooth[smooth.length - 1]); // today's 3-day avg

    // recent window vs the one before it — gentle, interpretable, not a
    // noisy regression over a handful of points
    const half = Math.min(4, Math.floor(active.length / 2));
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const recent = avg(ys.slice(-half));
    const prior = avg(ys.slice(-2 * half, -half));
    const ratio = prior ? recent / prior : 1;
    const delta = Math.round(recent - prior);
    const dir =
      active.length < 4 || !prior ? "new"
      : ratio >= 1.05 ? "up"
      : ratio <= 0.9 ? "dip"
      : "steady";

    return { active, ys, smooth, total, best, daysLogged, typical, delta, dir };
  }, [days]);

  if (!stats) {
    return (
      <div className="card">
        <h2>Pumping history</h2>
        <p className="muted">A few days of logs and your picture builds here — with the numbers worth celebrating, not just a line.</p>
      </div>
    );
  }

  const { active, ys, smooth, total, best, daysLogged, typical, delta, dir } = stats;

  // colours: her supply is never shown in alarm-red
  const accent =
    dir === "up" ? "var(--sage)" : dir === "dip" ? "var(--rose)" : "var(--sky)";
  const badge =
    dir === "up" ? "↗ on the rise"
    : dir === "dip" ? "easing off a little"
    : dir === "new" ? "just getting going"
    : "→ holding steady";

  // zero-based axis so a normal wobble reads as a normal wobble
  const W = 320, H = 120, padX = 8, padTop = 12, padBot = 10;
  const ymax = Math.max(...smooth, ...ys, 1) * 1.15;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (active.length - 1 || 1);
  const y = (v: number) => H - padBot - (v / ymax) * (H - padTop - padBot);
  const smLine = smooth.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${smLine} L${x(active.length - 1).toFixed(1)},${(H - padBot).toFixed(1)} L${x(0).toFixed(1)},${(H - padBot).toFixed(1)} Z`;
  const gid = "pumpfill";

  return (
    <div className="card">
      <h2>
        Pumping history{" "}
        <span className="badge" style={{ background: accent, color: "var(--on-accent)" }}>
          {badge}
        </span>
      </h2>

      <div className="pumpstats">
        <div className="pumpstat">
          <span className="pumpstat-n">{vol(typical)}</span>
          <span className="pumpstat-l">a typical day now</span>
        </div>
        <div className="pumpstat">
          <span className="pumpstat-n">{vol(best.ml)}</span>
          <span className="pumpstat-l">best day · {label(best.date)}</span>
        </div>
        <div className="pumpstat">
          <span className="pumpstat-n">{vol(total)}</span>
          <span className="pumpstat-l">{daysLogged} days · {sessions} sessions</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Expressed millilitres per day, three-day average">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
        <path d={smLine} fill="none" stroke={accent} strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" />
        {active.map((d, i) => d.ml > 0 && (
          <circle key={i} cx={x(i)} cy={y(d.ml)} r="1.9" fill={accent} opacity="0.35" />
        ))}
      </svg>
      <p className="muted" style={{ marginTop: 2 }}>
        {label(active[0].date)} → {label(active[active.length - 1].date)} · faint dots are each day, the line is your 3-day average
      </p>

      <p className="note" style={{ marginTop: 10 }}>
        {dir === "up" && (
          <>Lovely — you&apos;re up about <b>{vol(Math.abs(delta))}/day</b> on the days before. Whatever you&apos;re doing, it&apos;s working. 💛</>
        )}
        {dir === "steady" && (
          <>Holding steady — that&apos;s exactly what an established supply looks like, not a plateau to fix. Every session is keeping it there. 💛</>
        )}
        {dir === "new" && (
          <>Early days, and every session is laying down your supply. It climbs in fits and starts — the number matters far less than turning up. 💛</>
        )}
        {dir === "dip" && (
          <>A little softer than last week — really common, especially running on broken sleep. It usually nudges back with one extra session or a{" "}
          power-pump, and your unit&apos;s lactation team love being asked. Remember frequency matters more than any single day, and every drop is medicine for Maisie. 💛</>
        )}
      </p>
    </div>
  );
}
