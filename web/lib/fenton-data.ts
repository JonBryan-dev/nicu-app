// lib/fenton.ts — Fenton Third-Generation (2025) preterm growth chart, GIRLS weight (kg),
// 3rd/10th/50th/90th/97th centiles at whole weeks 22–50 postmenstrual age.
// Source: Fenton et al. 2025 (Maternal & Child Nutrition, PMC12391854), values via the
// public visualization dataset (github.com/mountex/fenton_data). Free for non-commercial
// use; a commercial licence from the Fenton team (ucalgary.ca/fenton) is needed before
// selling/distributing the app publicly.

export const FENTON_WEEKS_FROM = 22;
export const FENTON_WEEKS_TO = 50;
export const FENTON_GIRLS_WEIGHT_KG: Record<number, number[]> = {
  3: [0.35, 0.39, 0.43, 0.46, 0.49, 0.54, 0.58, 0.65, 0.74, 0.85, 1, 1.15, 1.35, 1.55, 1.75, 1.95, 2.15, 2.35, 2.55, 2.75, 2.95, 3.15, 3.35, 3.55, 3.75, 3.95, 4.15, 4.35, 4.55],
  10: [0.38, 0.43, 0.48, 0.53, 0.58, 0.65, 0.72, 0.8, 0.9, 1.02, 1.18, 1.35, 1.55, 1.75, 1.95, 2.15, 2.35, 2.55, 2.75, 2.95, 3.15, 3.35, 3.55, 3.75, 3.95, 4.15, 4.35, 4.55, 4.75],
  50: [0.45, 0.52, 0.59, 0.67, 0.76, 0.86, 0.98, 1.1, 1.25, 1.42, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4, 4.2, 4.4, 4.6, 4.8, 5, 5.2],
  90: [0.52, 0.6, 0.69, 0.79, 0.9, 1.02, 1.16, 1.32, 1.5, 1.7, 1.92, 2.15, 2.4, 2.65, 2.9, 3.15, 3.4, 3.65, 3.9, 4.15, 4.4, 4.65, 4.9, 5.15, 5.4, 5.65, 5.9, 6.15, 6.4],
  97: [0.55, 0.64, 0.74, 0.85, 0.97, 1.1, 1.25, 1.42, 1.6, 1.8, 2.02, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.25, 5.5, 5.75, 6, 6.25, 6.5],
};
