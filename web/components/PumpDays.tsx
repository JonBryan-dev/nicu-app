"use client";
// PumpDays — the last few days overlaid by time of day, one colour-coded line
// each, as a running total from midnight. Overlaying them shows *why* a day is
// higher or lower: a line that pulls ahead early, or goes flat overnight
// (a skipped session), tells you far more than a single daily total. Same data
// source as PumpHistory so the day totals match.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtime } from "@/lib/useRealtime";

const DAYS = 4; // last N calendar days
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// newest → oldest; today is boldest, older days step back but stay distinct
const PALETTE = ["#6f9bb3", "#7faa72", "#d69f5b", "#c081a0"];

type Sess = { t: number; ml: number }; // t = hours since local midnight

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hourOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}
function dayLabel(key: string, todayKey: string, yestKey: string): string {
  if (key === todayKey) return "Today";
  if (key === yestKey) return "Yesterday";
  const [, m, d] = key.split("-").map(Number);
  const wd = DOW[new Date(key + "T00:00:00").getDay()];
  return `${wd} ${d}/${m}`;
}

export default function PumpDays({
  supabase,
  familyId,
}: {
  supabase: SupabaseClient;
  familyId: string;
}) {
  const [byDay, setByDay] = useState<Record<string, Sess[]>>({});

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (DAYS - 1));
    const sinceIso = since.toISOString();
    const [fd, ex] = await Promise.all([
      supabase.from("feeds").select("ml, started_at").eq("family_id", familyId).gte("started_at", sinceIso),
      supabase.from("expressing_logs").select("ml, at").eq("family_id", familyId).gte("at", sinceIso),
    ]);
    const out: Record<string, Sess[]> = {};
    const add = (iso: string, ml: number | null) => {
      if (!ml) return;
      (out[localDay(iso)] ??= []).push({ t: hourOf(iso), ml });
    };
    for (const f of (fd.data as { ml: number | null; started_at: string }[]) ?? []) add(f.started_at, f.ml);
    for (const r of (ex.data as { ml: number | null; at: string }[]) ?? []) add(r.at, r.ml);
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
    setByDay(out);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", familyId, load);
  useRealtime(supabase, "expressing_logs", familyId, load);

  const model = useMemo(() => {
    const now = new Date();
    const keyFor = (back: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const todayKey = keyFor(0);
    const yestKey = keyFor(1);
    // newest first; keep only days that actually have sessions
    const lines = [];
    for (let back = 0; back < DAYS; back++) {
      const key = keyFor(back);
      const sess = byDay[key];
      if (!sess || sess.length === 0) continue;
      let cum = 0;
      const pts = [{ t: 0, cum: 0 }];
      for (const s of sess) {
        cum += s.ml;
        pts.push({ t: s.t, cum });
      }
      lines.push({ key, pts, total: cum, count: sess.length, label: dayLabel(key, todayKey, yestKey), isToday: key === todayKey });
    }
    // typical full day = mean of the completed days (today's still in progress)
    const completed = lines.filter((l) => !l.isToday);
    const base = completed.length ? completed : lines;
    const avgTotal = Math.round(base.reduce((a, l) => a + l.total, 0) / base.length);
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const hasToday = lines.some((l) => l.isToday);
    return { lines, avgTotal, nowHour, hasToday };
  }, [byDay]);

  if (model.lines.length < 2) {
    return (
      <div className="card">
        <h2>Day by day</h2>
        <p className="muted">A couple of days of sessions and the day-by-day comparison appears here — each day its own colour-coded line.</p>
      </div>
    );
  }

  const { lines, avgTotal, nowHour, hasToday } = model;
  const W = 320, H = 150, padL = 6, padR = 6, padTop = 10, padBot = 18;
  const maxY = Math.max(...lines.map((l) => l.total), avgTotal, 1) * 1.08;
  const x = (t: number) => padL + (t / 24) * (W - padL - padR);
  const y = (v: number) => H - padBot - (v / maxY) * (H - padTop - padBot);
  const path = (pts: { t: number; cum: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const colour = (i: number) => PALETTE[Math.min(i, PALETTE.length - 1)];

  return (
    <div className="card">
      <h2>Day by day</h2>
      <p className="muted" style={{ marginBottom: 8 }}>
        Each line is one day&apos;s running total by the clock — where a line goes flat, that&apos;s a longer gap between sessions.
      </p>

      <div className="pumpdays-legend">
        {lines.map((l, i) => (
          <span key={l.key} className="pumpdays-key">
            <span className="pumpdays-swatch" style={{ background: colour(i) }} />
            {l.label} · <b>{l.total} ml</b> <span className="muted">({l.count})</span>
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Running expressed total by time of day, one line per recent day">
        {/* hour gridlines at 06:00, 12:00, 18:00 */}
        {[6, 12, 18].map((h) => (
          <g key={h}>
            <line x1={x(h)} y1={padTop} x2={x(h)} y2={H - padBot} stroke="var(--line, #0001)" strokeWidth="1" />
            <text x={x(h)} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--ink-soft)">{`${h}:00`}</text>
          </g>
        ))}
        <line x1={padL} y1={H - padBot} x2={W - padR} y2={H - padBot} stroke="var(--line, #0002)" strokeWidth="1" />
        {/* typical full-day total — is today tracking above or below? */}
        <line x1={padL} y1={y(avgTotal)} x2={W - padR} y2={y(avgTotal)} stroke="var(--ink-soft)" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
        <text x={padL + 2} y={y(avgTotal) - 4} textAnchor="start" fontSize="9" fill="var(--ink-soft)">{`typical ~${avgTotal} ml`}</text>
        {/* "now" — how far through today we are */}
        {hasToday && nowHour > 0.3 && (
          <>
            <line x1={x(nowHour)} y1={padTop} x2={x(nowHour)} y2={H - padBot} stroke={PALETTE[0]} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
            <text x={Math.min(x(nowHour), W - padR - 14)} y={padTop + 7} textAnchor="middle" fontSize="9" fill={PALETTE[0]}>now</text>
          </>
        )}
        {/* oldest first so today draws on top */}
        {lines.slice().reverse().map((l) => {
          const i = lines.indexOf(l);
          return (
            <path
              key={l.key}
              d={path(l.pts)}
              fill="none"
              stroke={colour(i)}
              strokeWidth={l.isToday ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={l.isToday ? 1 : 0.85}
            />
          );
        })}
        {/* endpoint dots */}
        {lines.map((l, i) => (
          <circle key={l.key} cx={x(l.pts[l.pts.length - 1].t)} cy={y(l.total)} r={l.isToday ? 3 : 2.4} fill={colour(i)} />
        ))}
      </svg>
    </div>
  );
}
