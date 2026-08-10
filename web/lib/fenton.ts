// lib/fenton.ts — helpers over the Fenton girls' weight centiles: curve values
// at any (fractional) postmenstrual age, and an approximate centile for a
// weight. Interpolation is linear between weekly points and between adjacent
// centile curves — an honest "≈", not a clinical z-score.
import {
  FENTON_GIRLS_WEIGHT_KG,
  FENTON_WEEKS_FROM,
  FENTON_WEEKS_TO,
} from "./fenton-data";

export const FENTON_CENTILES = [3, 10, 50, 90, 97] as const;
export type FentonCentile = (typeof FENTON_CENTILES)[number];

/** Weight (kg) on a centile curve at a (possibly fractional) PMA in weeks. */
export function curveAt(centile: FentonCentile, pmaWeeks: number): number {
  const arr = FENTON_GIRLS_WEIGHT_KG[centile];
  const t = Math.min(Math.max(pmaWeeks, FENTON_WEEKS_FROM), FENTON_WEEKS_TO) - FENTON_WEEKS_FROM;
  const i = Math.min(Math.floor(t), arr.length - 2);
  const frac = t - i;
  return arr[i] + (arr[i + 1] - arr[i]) * frac;
}

/** Approximate centile (1–99, clamped) for a weight at a PMA. */
export function centileFor(weightKg: number, pmaWeeks: number): number {
  const vals = FENTON_CENTILES.map((c) => ({ c, v: curveAt(c, pmaWeeks) }));
  if (weightKg <= vals[0].v) return Math.max(1, Math.round(3 * (weightKg / vals[0].v)));
  if (weightKg >= vals[vals.length - 1].v) return 97;
  for (let i = 0; i < vals.length - 1; i++) {
    const a = vals[i], b = vals[i + 1];
    if (weightKg >= a.v && weightKg <= b.v) {
      const frac = (weightKg - a.v) / (b.v - a.v || 1);
      return Math.round(a.c + (b.c - a.c) * frac);
    }
  }
  return 50;
}

/** Postmenstrual age in weeks for a date, given DOB and gestation at birth. */
export function pmaAt(dateStr: string, dob: string, gestationDays: number): number {
  const ageDays = Math.round(
    (Date.parse(dateStr + "T00:00:00Z") - Date.parse(dob + "T00:00:00Z")) / 864e5
  );
  return (gestationDays + ageDays) / 7;
}

export function fmtGestation(days: number): string {
  return `${Math.floor(days / 7)}+${days % 7}`;
}
