// scripts/test-companion.mjs — date maths, daily rotation, and chat guardrails
// for lib/companion.ts. Run: node scripts/test-companion.mjs
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(mkdtempSync(join(tmpdir(), "comp-")), "companion.mjs");
execSync(`npx esbuild lib/companion.ts --bundle --format=esm --outfile=${out}`, { stdio: "pipe" });
const c = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// ---- journey maths: born 2026-06-01 at 26+0 (182 days) → due 2026-09-07 (14w later)
const G26 = 26 * 7;
const j0 = c.journey("2026-06-01", G26, "2026-06-01");
eq("due date", j0.dueDate, "2026-09-07");
eq("day 0 GA", j0.gaLabel, "26 weeks 0 days");
eq("day 0 progress", j0.progress, 0);
eq("phase before due", j0.phase, "before-due");
const j24 = c.journey("2026-06-01", G26, "2026-06-25"); // 24 days later → 29+3
eq("29+3 label", j24.gaLabel, "29 weeks 3 days");
eq("days old", j24.daysOld, 24);
eq("weeks to due (98-24=74d → 11w)", j24.weeksToDue, 11);
eq("progress 24/98", +j24.progress.toFixed(3), +(24 / 98).toFixed(3));
const j28 = c.journey("2026-06-01", G26, "2026-06-15"); // exactly 28+0
eq("28w milestone flagged", j28.milestone, 28);
eq("27w no milestone", c.journey("2026-06-01", G26, "2026-06-08").milestone, null);
const jDue = c.journey("2026-06-01", G26, "2026-09-07");
eq("on due date → after-due", jDue.phase, "after-due");
eq("corrected 0w0d", jDue.correctedLabel, "0 weeks 0 days corrected");
const jAfter = c.journey("2026-06-01", G26, "2026-10-01"); // 24 days past due
eq("corrected 3w3d", jAfter.correctedLabel, "3 weeks 3 days corrected");
eq("gestation configurable: 25+0 born 2026-06-01 → due 2026-09-14", c.journey("2026-06-01", 25 * 7, "2026-06-01").dueDate, "2026-09-14");

// ---- daily rotation: deterministic per day, rotates
eq("same day same question", c.pick(c.QUESTIONS, "2026-08-10").q, c.pick(c.QUESTIONS, "2026-08-10").q);
eq("next day different question", c.pick(c.QUESTIONS, "2026-08-11").q !== c.pick(c.QUESTIONS, "2026-08-10").q, true);
eq("offset cycles", c.pick(c.QUESTIONS, "2026-08-10", 1).q, c.pick(c.QUESTIONS, "2026-08-11").q);
eq("wraps after bank length", c.pick(c.QUESTIONS, "2026-08-10", c.QUESTIONS.length).q, c.pick(c.QUESTIONS, "2026-08-10").q);
eq("fact deterministic", c.pick(c.POSITIVE_FACTS, "2026-08-10").text, c.pick(c.POSITIVE_FACTS, "2026-08-10").text);
eq("wellbeing rotates", new Set(Array.from({ length: 8 }, (_, i) => c.pick(c.WELLBEING, "2026-08-10", i))).size, 8);

// ---- system prompt embeds the ENTIRE knowledge base and the hard rules
const sp = c.systemPrompt("Maisie");
for (const f of c.FACTS) eq(`prompt has fact: ${f.topic}`, sp.includes(f.text.slice(0, 40)), true);
for (const q of c.QUESTIONS) eq(`prompt has question`, sp.includes(q.q.slice(0, 30)), true);
eq("prompt: only permitted source", sp.includes("ONLY permitted source of factual claims"), true);
eq("prompt: no medical advice", /No medical advice, no diagnosis, no prognosis/.test(sp), true);
eq("prompt: names sources", /name the source \(Bliss or RCPCH\)/.test(sp), true);
eq("prompt: distress handling", /Bliss support services/.test(sp), true);
eq("prompt: baby name", sp.includes("Maisie"), true);

// ---- offline mode: breathing question → breathing content citing Bliss; caffeine → decline + redirect
const breath = c.offlineAnswer("What does the ventilator do and why is she back on CPAP?");
eq("offline breathing: ladder content", /ladder/.test(breath), true);
eq("offline breathing: cites Bliss", /Bliss/.test(breath), true);
eq("offline breathing: redirects to team", /neonatal team/.test(breath), true);
eq("offline breathing: says offline", /offline mode/.test(breath), true);
const caff = c.offlineAnswer("what dose of caffeine is my baby on?");
eq("offline caffeine: no invented dose", /\d+ ?mg/.test(caff), false);
eq("offline caffeine: declines kindly", /don't have anything on that/.test(caff), true);
eq("offline caffeine: redirects to team", /neonatal team/.test(caff), true);
const dist = c.offlineAnswer("I'm struggling today, I can't do this");
eq("offline distress: care first", dist.startsWith("First — I'm really glad you said that"), true);
eq("offline distress: Bliss support surfaced", /video call support/.test(dist), true);
const cor = c.offlineAnswer("How does corrected age work?");
eq("offline corrected age: RCPCH growth fact", /corrected age/.test(cor) && /RCPCH/.test(cor), true);

// ---- every fact carries a source + URL
for (const f of c.FACTS) eq(`fact sourced: ${f.topic}`, ["Bliss", "RCPCH"].includes(f.source) && f.url.startsWith("https://"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
