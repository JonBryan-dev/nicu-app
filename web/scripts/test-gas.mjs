// scripts/test-gas.mjs — threshold-edge + pattern-branch tests for lib/gas.ts.
// Run: node scripts/test-gas.mjs   (bundles the TS with esbuild, no test runner needed)
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(mkdtempSync(join(tmpdir(), "gas-")), "gas.mjs");
execSync(`npx esbuild lib/gas.ts --bundle --format=esm --outfile=${out}`, { stdio: "pipe" });
const g = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const band = (v) => (v ? v[0] : null);
const E = (o) => ({ ph: 7.4, co2: 5.5, hco3: null, glu: null, lac: null, fio2: null, mode: null, ...o });

// pH edges: 7.25 / 7.30 / 7.35 / 7.45
eq("pH 7.249 act", band(g.classifyPH(7.249)), "act");
eq("pH 7.25 watch", band(g.classifyPH(7.25)), "watch");
eq("pH 7.299 watch", band(g.classifyPH(7.299)), "watch");
eq("pH 7.30 soft", band(g.classifyPH(7.3)), "soft");
eq("pH 7.349 soft", band(g.classifyPH(7.349)), "soft");
eq("pH 7.35 ok", band(g.classifyPH(7.35)), "ok");
eq("pH 7.45 ok", band(g.classifyPH(7.45)), "ok");
eq("pH 7.451 watch", band(g.classifyPH(7.451)), "watch");
// CO2 edges: 4.8 / 6.0 / 8.0 / 10.0
eq("CO2 4.79 watch", band(g.classifyCO2(4.79, null)), "watch");
eq("CO2 4.8 ok", band(g.classifyCO2(4.8, null)), "ok");
eq("CO2 6.0 ok", band(g.classifyCO2(6.0, null)), "ok");
eq("CO2 6.01 soft", band(g.classifyCO2(6.01, null)), "soft");
eq("CO2 8.0 soft", band(g.classifyCO2(8.0, null)), "soft");
eq("CO2 8.01 watch", band(g.classifyCO2(8.01, null)), "watch");
eq("CO2 10.0 watch", band(g.classifyCO2(10.0, null)), "watch");
eq("CO2 10.01 watch", band(g.classifyCO2(10.01, null)), "watch");
eq("CO2 vent copy", g.classifyCO2(9, "vent")[1].includes("settings problem"), true);
eq("CO2 selfbreathing copy", g.classifyCO2(9, "cpap")[1].includes("rising trend"), true);
// HCO3, glucose 2.6/3.5/9, lactate 2.5/4, FiO2 25/35/50
eq("HCO3 22 ok", band(g.classifyHCO3(22)), "ok");
eq("HCO3 26.1 soft", band(g.classifyHCO3(26.1)), "soft");
eq("HCO3 21.9 watch", band(g.classifyHCO3(21.9)), "watch");
eq("glu 2.59 act", band(g.classifyGlu(2.59)), "act");
eq("glu 2.6 watch", band(g.classifyGlu(2.6)), "watch");
eq("glu 3.5 ok", band(g.classifyGlu(3.5)), "ok");
eq("glu 9.0 ok", band(g.classifyGlu(9.0)), "ok");
eq("glu 9.01 watch", band(g.classifyGlu(9.01)), "watch");
eq("lac 2.5 ok", band(g.classifyLac(2.5)), "ok");
eq("lac 2.51 watch", band(g.classifyLac(2.51)), "watch");
eq("lac 4.01 act", band(g.classifyLac(4.01)), "act");
eq("fio2 25 ok", band(g.classifyFiO2(25)), "ok");
eq("fio2 26 soft", band(g.classifyFiO2(26)), "soft");
eq("fio2 36 watch", band(g.classifyFiO2(36)), "watch");
eq("fio2 51 act", band(g.classifyFiO2(51)), "act");
eq("null optionals", g.classifyHCO3(null), null);

// four pattern branches
const p1 = g.interpret(E({ ph: 7.28, co2: 7.5, mode: "cpap" }), null);
eq("P1 resp acidosis self-breathing", p1.lines[0].startsWith("Pattern: respiratory acidosis while she's doing her own breathing"), true);
const p1v = g.interpret(E({ ph: 7.28, co2: 7.5, mode: "vent", hco3: 28 }), null);
eq("P1 vent variant", p1v.lines[0].includes("on the ventilator"), true);
eq("P1 renal compensation appended", p1v.lines[1].includes("kidneys have been compensating"), true);
const p1n = g.interpret(E({ ph: 7.28, co2: 7.5, mode: null }), null);
eq("P1 no-mode variant", p1n.lines[0].includes("classic preterm picture"), true);
const p2 = g.interpret(E({ ph: 7.28, co2: 5.0, hco3: 18 }), null);
eq("P2 metabolic", p2.lines[0].startsWith("Pattern: metabolic acidosis"), true);
const p3 = g.interpret(E({ ph: 7.38, co2: 7.0 }), null);
eq("P3 compensated", p3.lines[0].startsWith("Pattern: compensated"), true);
const p4 = g.interpret(E({ ph: 7.40, co2: 5.5 }), null);
eq("P4 reassuring", p4.lines[0].startsWith("Pattern: this is a reassuring gas"), true);

// overall = worst band; headlines
eq("worst act headline", g.interpret(E({ ph: 7.2, co2: 5 }), null).headline, "The team will be acting on this one");
eq("worst ok headline", p4.headline, "Reassuring sample");
eq("worst soft headline", g.interpret(E({ ph: 7.32, co2: 5.5 }), null).headline, "Mildly off, commonly tolerated");
eq("worst watch headline", g.interpret(E({ ph: 7.27, co2: 5.5 }), null).headline, "Watch zone — trend matters most now");

// trend lines: pH steady <0.01, CO2 steady <0.3; FiO2 ±5; mode ladder both directions
const prev = E({ ph: 7.30, co2: 7.0, fio2: 30, mode: "cpap" });
const t1 = g.interpret(E({ ph: 7.305, co2: 7.2, fio2: 35, mode: "highflow" }), prev);
eq("trend steady/steady", t1.lines.some((l) => l.includes("pH has steady") && l.includes("CO₂ has steady")), true);
eq("FiO2 +5 flag", t1.lines.some((l) => l.startsWith("⚠️ She's needing more oxygen")), true);
eq("mode stepped down", t1.lines.some((l) => l.includes("stepped DOWN")), true);
const t2 = g.interpret(E({ ph: 7.25, co2: 8.0, fio2: 25, mode: "vent" }), prev);
eq("trend dropped/risen", t2.lines.some((l) => l.includes("pH has dropped") && l.includes("CO₂ has risen")), true);
eq("FiO2 -5 good sign", t2.lines.some((l) => l.includes("come down") && l.includes("genuinely good sign")), true);
eq("mode stepped up", t2.lines.some((l) => l.includes("stepped up")), true);
const t3 = g.interpret(E({ ph: 7.32, co2: 6.9, fio2: 34, mode: "cpap" }), prev);
eq("FiO2 +4 no flag", t3.lines.some((l) => l.includes("needing more oxygen")), false);
eq("same mode no ladder line", t3.lines.some((l) => l.includes("stepped")), false);
eq("pH improved", t3.lines.some((l) => l.includes("pH has improved")), true);


// ---- personal baseline: "high for the textbook, normal for her"
{
  const hist = [7.2, 7.5, 7.4, 7.6, 7.3, 7.4, 7.5, 7.3].map((co2, i) => E({ ph: 7.30 + (i % 3) * 0.01, co2, mode: "cpap" }));
  eq("no baseline under 5 samples", g.baseline(hist.slice(0, 4)), null);
  const b = g.baseline(hist);
  eq("baseline n", b.n, 8);
  eq("baseline co2 median ~7.4", +b.co2.median.toFixed(2), 7.4);
  const steady = g.baselineLines(E({ ph: 7.31, co2: 7.4, mode: "cpap" }), b, "Maisie");
  eq("7.4 for a 7.4-baseline baby: steady-for-her", /right where Maisie usually sits/.test(steady[0]), true);
  eq("...and explains her CO2 runs high as her normal", /runs a bit high as her normal/.test(steady[0]), true);
  const up = g.baselineLines(E({ ph: 7.31, co2: 8.6, mode: "cpap" }), b, "Maisie");
  eq("8.6 for her: flagged as higher than usual", /higher than her usual/.test(up[0]), true);
  const down = g.baselineLines(E({ ph: 7.31, co2: 6.0, mode: "cpap" }), b, "Maisie");
  eq("6.0 for her: lower than usual, good if it holds", /lower than her usual/.test(down[0]) && /good/.test(down[0]), true);
  const phDrop = g.baselineLines(E({ ph: 7.20, co2: 7.4, mode: "cpap" }), b, "Maisie");
  eq("pH well below her usual: flagged", phDrop.some((l) => /below her usual/.test(l)), true);
  eq("textbook band unchanged by baseline (still soft for 7.4)", g.classifyCO2(7.4, "cpap")[0], "soft");
}
console.log(`baseline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
