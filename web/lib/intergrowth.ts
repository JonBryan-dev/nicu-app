// lib/intergrowth.ts — INTERGROWTH-21st Preterm Postnatal Growth Standards
// (Villar et al., Lancet Global Health 2015), weight-for-age, GIRLS.
// Unlike Fenton (built from sizes AT birth — an intrauterine reference), these
// follow healthy preterm babies AFTER birth: the realistic comparison group.
// Valid 27–64 weeks postmenstrual age; cohort born ≥26 weeks gestation.
// Parametric standard: weight(kg) = exp(mu + z·sigma). Coefficients as
// published (via the rOpenSci `gigs` package, data-raw/R/ig_png.R), verified
// here against the official percentile tables to within 6 g. Open access.
export const IG_FROM = 27;
export const IG_TO = 64;

const mu = (x: number) => 2.591277 - 0.01155 * Math.sqrt(x) - 2201.705 / (x * x);
const sigma = (x: number) =>
  0.1470258 + 505.92394 / (x * x) - (140.0576 / (x * x)) * Math.log(x);

const Z: Record<number, number> = {
  3: -1.880794,
  10: -1.281552,
  50: 0,
  90: 1.281552,
  97: 1.880794,
};

/** Weight (kg) on a centile curve at a (fractional) PMA in weeks. */
export function igCurveAt(centile: number, pmaWeeks: number): number {
  const x = Math.min(Math.max(pmaWeeks, IG_FROM), IG_TO);
  return Math.exp(mu(x) + (Z[centile] ?? 0) * sigma(x));
}

/** Exact centile (1–99, clamped) from the published distribution. */
export function igCentileFor(weightKg: number, pmaWeeks: number): number {
  const x = Math.min(Math.max(pmaWeeks, IG_FROM), IG_TO);
  const z = (Math.log(weightKg) - mu(x)) / sigma(x);
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
