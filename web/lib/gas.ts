// lib/gas.ts — the "Cotside" interpretation engine for neonatal capillary
// blood gases, parent-facing. Pure functions, no I/O: ported verbatim from the
// prototype (thresholds are the contract; copy strings are the product).
//
// Educational tool, not a medical device. Nothing here recommends, predicts,
// or advises on treatment — escalation is always framed as "the team will be
// acting", never "you should". Capillary O2/sats are deliberately not modelled.

export type Band = "ok" | "soft" | "watch" | "act";
export type SupportMode = "air" | "lowflow" | "highflow" | "cpap" | "niv" | "vent";

export interface GasEntry {
  ph: number;
  co2: number; // kPa
  hco3: number | null;
  glu: number | null;
  lac: number | null;
  fio2: number | null;
  mode: SupportMode | null;
}

export const MODES: { id: SupportMode; label: string }[] = [
  { id: "air", label: "Breathing air (no support)" },
  { id: "lowflow", label: "Low-flow oxygen" },
  { id: "highflow", label: "High-flow (Optiflow/Vapotherm)" },
  { id: "cpap", label: "CPAP" },
  { id: "niv", label: "BiPAP / NIV" },
  { id: "vent", label: "Ventilator (intubated)" },
];
export const MODE_RANK: Record<SupportMode, number> = { air: 0, lowflow: 1, highflow: 2, cpap: 3, niv: 4, vent: 5 };
const selfBreathing = (m: SupportMode | null) => !!m && m !== "vent";

// validation bounds — reject outside as a typo
export const BOUNDS = {
  ph: [6.5, 8],
  co2: [1, 20],
  hco3: [5, 50],
  glu: [0, 30],
  lac: [0, 20],
  fio2: [21, 100],
} as const;

type Verdict = [Band, string];

export function classifyPH(v: number): Verdict {
  if (v >= 7.35 && v <= 7.45) return ["ok", "Right where it should be."];
  if (v > 7.45) return ["watch", "Higher than usual (alkalosis) — the team will look at why, e.g. over-breathing on support."];
  if (v >= 7.3) return ["soft", "A little low. Very common in preterm babies and usually tolerated while the cause is managed."];
  if (v >= 7.25) return ["watch", "In the zone most units watch closely. One value here isn't alarming — the trend and how she looks matter most."];
  return ["act", "Below the level most units use as a trigger to step up support. Expect the team to be actively adjusting things — that's them acting early, not an emergency siren."];
}

export function classifyCO2(v: number, mode: SupportMode | null): Verdict {
  const onVent = mode === "vent";
  if (v < 4.8) return ["watch", onVent ? "Low CO₂ — the ventilator may be doing slightly too much; settings will be wound down." : "Low CO₂ — she's blowing off more than usual. Team will check."];
  if (v <= 6.0) return ["ok", "Normal — CO₂ is being cleared well."];
  if (v <= 8.0) return ["soft", "Raised, but neonatal teams often deliberately accept CO₂ up to about here (“permissive hypercapnia”) as long as the pH holds up."];
  if (v <= 10.0) return ["watch", onVent ? "High — but on a ventilator this is largely a settings problem: expect rate or pressure to be adjusted." : "High — her lungs aren't clearing CO₂ well. Fine as a one-off if pH holds, but a rising trend is what prompts more support."];
  return ["watch", onVent ? "Very high — the team will be adjusting ventilator settings to bring this down." : "Very high. Paired with a falling pH or a tiring baby, this is what pushes teams toward more breathing support."];
}

export function classifyHCO3(v: number | null): Verdict | null {
  if (v === null) return null;
  if (v >= 22 && v <= 26) return ["ok", "Normal bicarbonate."];
  if (v > 26) return ["soft", "High — her kidneys are holding onto bicarbonate to buffer the CO₂. A sign of compensation that's been building, not a new problem."];
  return ["watch", "Low — suggests a metabolic (acid build-up) component. The team will look at lactate, feeding and perfusion."];
}

export function classifyGlu(v: number | null): Verdict | null {
  if (v === null) return null;
  if (v < 2.6) return ["act", "Low blood sugar for a newborn — the team will treat this promptly (feed/dextrose)."];
  if (v < 3.5) return ["watch", "Low-normal. In a baby working hard to breathe it can mean she's burning through fuel — worth watching."];
  if (v <= 9.0) return ["ok", "Normal blood sugar."];
  return ["watch", "High — common with stress or fluids; the team will keep an eye on it."];
}

export function classifyLac(v: number | null): Verdict | null {
  if (v === null) return null;
  if (v <= 2.5) return ["ok", "Normal lactate — her tissues are getting the oxygen they need."];
  if (v <= 4) return ["watch", "Mildly raised — can happen with hard work of breathing or a tricky heel-prick sample."];
  return ["act", "Raised lactate — the team will be looking into oxygen delivery and circulation."];
}

export function classifyFiO2(v: number | null): Verdict | null {
  if (v === null) return null;
  if (v <= 25) return ["ok", "Little or no extra oxygen — her lungs are handling oxygenation almost on their own."];
  if (v <= 35) return ["soft", "Modest extra oxygen. Common and usually comfortable territory in NICU."];
  if (v <= 50) return ["watch", "Needing a fair amount of oxygen — the number to watch is whether this creeps up over the day."];
  return ["act", "High oxygen requirement — the lungs are struggling to transfer oxygen and the team will be on top of this."];
}

const RANK: Record<Band, number> = { ok: 0, soft: 1, watch: 2, act: 3 };

export const HEADLINE: Record<Band, string> = {
  ok: "Reassuring sample",
  soft: "Mildly off, commonly tolerated",
  watch: "Watch zone — trend matters most now",
  act: "The team will be acting on this one",
};

export interface Interpretation {
  worst: Band;
  headline: string;
  lines: string[];
  per: {
    ph: Verdict;
    co2: Verdict;
    fio2: Verdict | null;
    hco3: Verdict | null;
    glu: Verdict | null;
    lac: Verdict | null;
  };
}

/** Full interpretation of one sample against the previous one (by taken_at). */
export function interpret(entry: GasEntry, prev: GasEntry | null): Interpretation {
  const ph = classifyPH(entry.ph);
  const co2 = classifyCO2(entry.co2, entry.mode);
  const hco3 = classifyHCO3(entry.hco3);
  const glu = classifyGlu(entry.glu);
  const lac = classifyLac(entry.lac);
  const fio2 = classifyFiO2(entry.fio2);
  const parts: Band[] = [ph[0], co2[0]];
  [hco3, glu, lac, fio2].forEach((p) => p && parts.push(p[0]));
  const worst = parts.reduce<Band>((a, b) => (RANK[b] > RANK[a] ? b : a), "ok");

  const lines: string[] = [];
  if (entry.co2 > 6.0 && entry.ph < 7.35) {
    if (selfBreathing(entry.mode)) {
      lines.push("Pattern: respiratory acidosis while she's doing her own breathing work — the question the team is asking is whether she can sustain that effort. Trend + how tired she looks decide it.");
    } else if (entry.mode === "vent") {
      lines.push("Pattern: respiratory acidosis on the ventilator — mostly a dials problem now. The machine takes the strain while settings are tuned to clear the CO₂.");
    } else {
      lines.push("Pattern: respiratory acidosis — the pH is low because CO₂ is high. The classic preterm picture: lungs not clearing CO₂ fast enough.");
    }
    if (entry.hco3 !== null && entry.hco3 > 26) {
      lines.push("The high bicarbonate shows her kidneys have been compensating — quietly buffering the acid. That's why the pH looks better than the CO₂ alone would suggest.");
    }
  } else if (entry.ph < 7.35 && entry.hco3 !== null && entry.hco3 < 22) {
    lines.push("Pattern: metabolic acidosis — the low pH is from acid build-up rather than CO₂. Lactate and perfusion are the things to check.");
  } else if (entry.ph >= 7.35 && entry.co2 > 6.0) {
    lines.push("Pattern: compensated. CO₂ is still high but the pH is normal — the support (and her kidneys) are keeping her balanced.");
  } else if (entry.ph >= 7.35 && entry.co2 <= 6.0) {
    lines.push("Pattern: this is a reassuring gas — pH and CO₂ both where they should be.");
  }

  if (prev) {
    const dph = entry.ph - prev.ph;
    const dco2 = entry.co2 - prev.co2;
    const phWord = Math.abs(dph) < 0.01 ? "steady" : dph > 0 ? "improved" : "dropped";
    const co2Word = Math.abs(dco2) < 0.3 ? "steady" : dco2 < 0 ? "come down" : "risen";
    lines.push(`Trend since last sample: pH has ${phWord} (${prev.ph.toFixed(3)} → ${entry.ph.toFixed(3)}), CO₂ has ${co2Word} (${prev.co2.toFixed(1)} → ${entry.co2.toFixed(1)} kPa).`);
    if (entry.fio2 !== null && prev.fio2 !== null) {
      const d = entry.fio2 - prev.fio2;
      if (d >= 5) lines.push(`⚠️ She's needing more oxygen than last time (${prev.fio2}% → ${entry.fio2}%). A creeping O₂ requirement often matters more than the gas itself — worth asking the team about.`);
      else if (d <= -5) lines.push(`Oxygen requirement has come down (${prev.fio2}% → ${entry.fio2}%) — a genuinely good sign that her lungs are recovering.`);
    }
    if (entry.mode && prev.mode) {
      const dm = MODE_RANK[entry.mode] - MODE_RANK[prev.mode];
      if (dm < 0) lines.push("Support has been stepped DOWN since last sample — that's the direction of travel you want.");
      if (dm > 0) lines.push("Support has been stepped up since last sample. Interpret this gas in that light: the team moved early to take work off her.");
    }
  }

  return { worst, headline: HEADLINE[worst], lines, per: { ph, co2, fio2, hco3, glu, lac } };
}
