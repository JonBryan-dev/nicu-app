// lib/intergrowth.ts — INTERGROWTH-21st Preterm Postnatal Growth Standards
// (Villar et al., Lancet Global Health 2015), GIRLS: weight-for-age (kg),
// length-for-age (cm), head-circumference-for-age (cm).
// Unlike Fenton (built from sizes AT birth — an intrauterine reference), these
// follow healthy preterm babies AFTER birth: the realistic comparison group.
// Valid 27–64 weeks postmenstrual age; cohort born ≥26 weeks gestation.
// Parametric standards: weight & length are log-normal (value = exp(mu+z·sigma)),
// head circumference is normal (value = mu+z·sigma). Coefficients as published
// (via the rOpenSci `gigs` package, R/ig_png.R), verified here against the
// official percentile tables to within 6 g / 0.06 cm. Open access.
import type { Measure } from "./fenton";

export const IG_FROM = 27;
export const IG_TO = 64;

const PARAMS: Record<Measure, { mu: (x: number) => number; sigma: (x: number) => number; log: boolean }> = {
  weight: {
    mu: (x) => 2.591277 - 0.01155 * Math.sqrt(x) - 2201.705 / (x * x),
    sigma: (x) => 0.1470258 + 505.92394 / (x * x) - (140.0576 / (x * x)) * Math.log(x),
    log: true,
  },
  length: {
    mu: (x) => 4.136244 - 547.0018 / (x * x) + 0.0026066 * x,
    sigma: (x) => 0.050489 + 310.44761 / (x * x) - (90.0742 / (x * x)) * Math.log(x),
    log: true,
  },
  hc: {
    mu: (x) => 55.53617 - 852.0059 / x,
    sigma: (x) => 3.0582292 + 3910.05 / (x * x) - 180.5625 / x,
    log: false,
  },
};

const Z: Record<number, number> = {
  3: -1.880794,
  10: -1.281552,
  50: 0,
  90: 1.281552,
  97: 1.880794,
};

/** Value on a centile curve at a (fractional) PMA in weeks. */
export function igCurveAt(centile: number, pmaWeeks: number, measure: Measure = "weight"): number {
  const x = Math.min(Math.max(pmaWeeks, IG_FROM), IG_TO);
  const p = PARAMS[measure];
  const y = p.mu(x) + (Z[centile] ?? 0) * p.sigma(x);
  return p.log ? Math.exp(y) : y;
}

/** Exact centile (1–99, clamped) from the published distribution. */
export function igCentileFor(value: number, pmaWeeks: number, measure: Measure = "weight"): number {
  const x = Math.min(Math.max(pmaWeeks, IG_FROM), IG_TO);
  const p = PARAMS[measure];
  const y = p.log ? Math.log(value) : value;
  const z = (y - p.mu(x)) / p.sigma(x);
  return Math.min(99, Math.max(1, Math.round(normCdf(z) * 100)));
}

// Abramowitz–Stegun approximation of the normal CDF — ample for display
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}
