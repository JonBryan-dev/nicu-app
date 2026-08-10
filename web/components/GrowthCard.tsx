"use client";
// GrowthCard — weight & feeds log with the Fenton preterm growth chart.
// Once a parent sets gestation at birth, weights are plotted at Maisie's
// postmenstrual age against the Fenton girls' centiles (3/10/50/90/97) with
// her approximate centile called out. Copy is deliberately honest: babies
// growing on the outside usually sit below the birth-size curves at first
// (postnatal growth restriction — Ehrenkranz 1999 and successors), so the
// shape of her line matters more than which centile she's on.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate } from "@/lib/dates";
import { FENTON_CENTILES, curveAt, centileFor, pmaAt, fmtGestation } from "@/lib/fenton";
import { igCurveAt, igCentileFor, IG_FROM } from "@/lib/intergrowth";
import type { CareLog } from "@/lib/types";

type RefKind = "fenton" | "ig";

function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][Math.min(n % 10, 4)] ?? "th"}`;
}

function PlainChart({ logs }: { logs: CareLog[] }) {
  const pts = logs
    .filter((l) => l.weight_grams != null)
    .map((l) => ({ date: l.log_date, g: l.weight_grams as number }));
  if (pts.length < 2) return null;
  const W = 320, H = 90, pad = 6;
  const gs = pts.map((p) => p.g);
  const min = Math.min(...gs), max = Math.max(...gs);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (g: number) => H - pad - ((g - min) / span) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.g).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Weight over time" style={{ display: "block", marginTop: 4 }}>
      <path d={d} fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.g)} r="3" fill="var(--sage)" />
      ))}
    </svg>
  );
}

function FentonChart({
  logs,
  dob,
  gestationDays,
  refKind,
}: {
  logs: CareLog[];
  dob: string;
  gestationDays: number;
  refKind: RefKind;
}) {
  const isIG = refKind === "ig";
  const cAt = isIG ? igCurveAt : curveAt;
  const centFn = isIG ? igCentileFor : centileFor;
  const minWeek = isIG ? IG_FROM : 22;
  const curveColour = isIG ? "var(--sage)" : "var(--sky)";

  const pts = logs
    .filter((l) => l.weight_grams != null)
    .map((l) => ({
      pma: pmaAt(l.log_date, dob, gestationDays),
      kg: (l.weight_grams as number) / 1000,
    }))
    .filter((p) => p.pma >= minWeek && p.pma <= 50);
  if (!pts.length) return null;

  const latest = pts[pts.length - 1];
  const cent = centFn(latest.kg, latest.pma);

  // window: a little context either side of her data
  const x0 = Math.max(minWeek, Math.floor(Math.min(...pts.map((p) => p.pma)) - 1));
  const x1 = Math.min(50, Math.ceil(Math.max(...pts.map((p) => p.pma)) + 1.5));
  const lo = Math.min(cAt(3, x0) * 0.92, Math.min(...pts.map((p) => p.kg)) - 0.05);
  const hi = Math.max(cAt(97, x1) * 1.03, Math.max(...pts.map((p) => p.kg)) + 0.05);

  const W = 330, H = 190, padL = 30, padR = 24, padT = 8, padB = 20;
  const x = (w: number) => padL + ((w - x0) / (x1 - x0 || 1)) * (W - padL - padR);
  const y = (kg: number) => H - padB - ((kg - lo) / (hi - lo || 1)) * (H - padT - padB);

  const curvePath = (c: (typeof FENTON_CENTILES)[number]) => {
    const step = (x1 - x0) / 24;
    let d = "";
    for (let i = 0; i <= 24; i++) {
      const w = x0 + i * step;
      d += `${i ? "L" : "M"}${x(w).toFixed(1)},${y(cAt(c, w)).toFixed(1)}`;
    }
    return d;
  };
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.pma).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");

  // x ticks every 2 weeks; y ticks at sensible ½kg steps
  const xTicks: number[] = [];
  for (let w = Math.ceil(x0 / 2) * 2; w <= x1; w += 2) xTicks.push(w);
  const yStep = hi - lo > 2 ? 1 : 0.5;
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yTicks.push(+v.toFixed(1));

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Weight against the Fenton preterm centiles" style={{ display: "block", marginTop: 6 }}>
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--mist)" strokeWidth="1" />
            <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="8.5" fill="var(--ink-soft)">{v}</text>
          </g>
        ))}
        {xTicks.map((w) => (
          <text key={`x${w}`} x={x(w)} y={H - 6} textAnchor="middle" fontSize="8.5" fill="var(--ink-soft)">{w}w</text>
        ))}
        {FENTON_CENTILES.map((c) => (
          <g key={c}>
            <path d={curvePath(c)} fill="none" stroke={curveColour} strokeWidth={c === 50 ? 1.6 : 1} opacity={c === 50 ? 0.75 : 0.45} />
            <text x={W - padR + 3} y={y(cAt(c, x1)) + 3} fontSize="8" fill={curveColour}>{c}</text>
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--rose-deep)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.pma)} cy={y(p.kg)} r={i === pts.length - 1 ? 3.4 : 2.4} fill="var(--rose-deep)" />
        ))}
      </svg>
      <p className="muted" style={{ marginTop: 4 }}>
        {isIG ? "INTERGROWTH-21st preterm growth (girls)" : "Fenton preterm chart (girls)"} · born{" "}
        {fmtGestation(gestationDays)} · now {fmtGestation(Math.round(latest.pma * 7))} corrected ·{" "}
        <b>{isIG ? "" : "≈ "}{ordinal(cent)} centile</b>
      </p>
      {isIG ? (
        <p className="note" style={{ marginTop: 8 }}>
          These lines follow healthy <i>preterm</i> babies growing after birth — the realistic
          comparison, which is why they sit lower than the Fenton (birth-size) lines. Built from
          babies born at 26 weeks or later, shown from 27 weeks corrected.
        </p>
      ) : (
        <p className="note" style={{ marginTop: 8 }}>
          A gentle heads-up on reading this: the centile lines are built from babies&apos; sizes <i>at birth</i>.
          Babies who are already out and growing on the outside almost always sit lower at first and then climb{" "}
          <i>parallel</i> to the lines — that&apos;s the well-documented, expected pattern, not falling behind.
          Her own line&apos;s steady climb is the thing that matters, and her team tracks exactly that.
        </p>
      )}
    </>
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
  // local override so the chart appears the moment gestation is saved
  const [gestation, setGestation] = useState<number | null>(family.gestation_days ?? null);
  const [refKind, setRefKind] = useState<RefKind>("fenton");
  const [gWeeks, setGWeeks] = useState(28);
  const [gDays, setGDays] = useState(0);
  const [showGest, setShowGest] = useState(false);

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

  async function saveGestation(e: React.FormEvent) {
    e.preventDefault();
    const days = gWeeks * 7 + gDays;
    const { error } = await supabase
      .from("families")
      .update({ gestation_days: days })
      .eq("id", family.id);
    if (error) {
      setErr(
        /gestation_days/.test(error.message)
          ? "The gestation column isn't in the database yet — run migration 026 first."
          : error.message
      );
      return;
    }
    setGestation(days);
    setShowGest(false);
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
      ) : gestation ? (
        <>
          {(() => {
            const canIG = logs.some(
              (l) =>
                l.weight_grams != null &&
                pmaAt(l.log_date, family.baby_dob, gestation) >= IG_FROM
            );
            return (
              <div className="viewtabs" style={{ maxWidth: 320, margin: "8px auto 0" }}>
                <button
                  className={refKind === "fenton" ? "on" : ""}
                  onClick={() => setRefKind("fenton")}
                >
                  Birth sizes
                </button>
                <button
                  className={refKind === "ig" ? "on" : ""}
                  disabled={!canIG}
                  title={canIG ? undefined : "Appears from 27 weeks corrected age"}
                  onClick={() => canIG && setRefKind("ig")}
                >
                  Preterm growth{!canIG && " (27w+)"}
                </button>
              </div>
            );
          })()}
          <FentonChart logs={logs} dob={family.baby_dob} gestationDays={gestation} refKind={refKind} />
        </>
      ) : (
        <PlainChart logs={logs} />
      )}
      {logs.length > 0 && (
        <p className="muted" style={{ marginTop: 2 }}>
          {logs.filter((l) => l.weight_grams != null).length} weigh-ins ·{" "}
          {fmtDate(logs[0].log_date)} → {fmtDate(logs[logs.length - 1].log_date)}
        </p>
      )}

      {isParent && !gestation && logs.length > 0 && (
        showGest ? (
          <form onSubmit={saveGestation} style={{ marginTop: 10 }}>
            <p className="note">
              Set how far along she was at birth and this becomes a proper Fenton preterm
              chart, with her centile worked out at her corrected age.
            </p>
            <div className="row wrap">
              <div>
                <label htmlFor="gc-gw">Weeks</label>
                <select id="gc-gw" value={gWeeks} onChange={(e) => setGWeeks(+e.target.value)}>
                  {Array.from({ length: 21 }, (_, i) => 22 + i).map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gc-gd">+ days</label>
                <select id="gc-gd" value={gDays} onChange={(e) => setGDays(+e.target.value)}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <button className="primary" style={{ flex: "0 0 auto" }} type="submit">Save</button>
            </div>
          </form>
        ) : (
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setShowGest(true)}>
            📈 Add her birth gestation → Fenton chart
          </button>
        )
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
      {!open && err && <p className="err">{err}</p>}
    </div>
  );
}
