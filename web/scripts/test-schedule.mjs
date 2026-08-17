// scripts/test-schedule.mjs — pumping-schedule tests for lib/feedSchedule.ts,
// focused on the pinned power pump and the "pumps in 24h" count.
// Run: node --experimental-strip-types scripts/test-schedule.mjs   (no deps)
import {
  computeSchedule,
  powerPumpAt,
  fmtHM,
  DEFAULT_SETTINGS,
  POWER_PUMP_TIME,
} from "../lib/feedSchedule.ts";

let pass = 0,
  fail = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};

// Mum sleeps 23:20 → 04:45; the power pump is the first session on waking.
const sleep = [{ person: "mum", start_time: "23:20", end_time: "04:45", kind: "sleep" }];
const at = (h, m) => new Date(2026, 7, 17, h, m, 0, 0);
const plan = (now, feeds = [], settings = DEFAULT_SETTINGS, windows = sleep) =>
  computeSchedule(settings, feeds, windows, [], now, { pumping: true });
const powerPump = (h, m) => ({
  started_at: at(h, m).toISOString(),
  ended_at: at(h + 1, m).toISOString(),
  ml: 60,
  note: "Power pump 💪",
});
const pump = (h, m) => ({
  started_at: at(h, m).toISOString(),
  ended_at: at(h, m + 20).toISOString(),
  ml: 40,
  note: null,
});

// --- the pin itself
eq("power pump time", POWER_PUMP_TIME, "04:45");
eq("today's is still ahead at 03:00", fmtHM(powerPumpAt(at(3, 0))), "04:45");
eq("today's has passed at 10:00 → tomorrow's", powerPumpAt(at(10, 0)).getDate(), 18);
eq("exactly on it → the next one", powerPumpAt(at(4, 45)).getDate(), 18);

// --- the day's shape
const day = plan(at(10, 0));
eq("nine sessions, power pump included", day.length, 9);
eq("exactly one power pump", day.filter((s) => s.power).length, 1);
eq("it is pinned to 04:45", fmtHM(day.find((s) => s.power).at), "04:45");
eq("it closes the day", day[day.length - 1].power, true);
eq("chronological", [...day].sort((a, b) => +a.at - +b.at).map((s) => +s.at), day.map((s) => +s.at));
eq(
  "last pump of the day is before midnight",
  day.filter((s) => !s.power).every((s) => s.at.getHours() < 24 && s.at.getDate() === 17),
  true
);
eq(
  "nothing planned between the last pump and the power pump",
  day.filter((s) => !s.power && s.at.getHours() >= 23 && s.at.getMinutes() > 20).length,
  0
);

// --- the count holds as the day fills up
eq("count holds with ordinary pumps logged", plan(at(12, 0), [pump(7, 30), pump(9, 40)]).length, 9);
const done = plan(at(10, 0), [powerPump(4, 45)]);
eq("count holds once the power pump is done", done.length, 9);
eq("the logged one is badged", done.find((s) => s.power)?.logged, true);
eq("and tomorrow's is not shown twice", done.filter((s) => s.power).length, 1);

// --- other counts still honoured
for (const n of [7, 8, 9, 10]) {
  eq(`count of ${n}`, plan(at(10, 0), [], { ...DEFAULT_SETTINGS, feeds_per_day: n }).length, n);
}

// --- the pinned pump never doubles up with a planned session
for (const h of [3, 4, 5, 6, 12, 22, 23]) {
  const s = plan(at(h, 30));
  const times = s.map((x) => +x.at);
  eq(`no duplicate times at ${h}:30`, times.length, new Set(times).size);
  eq(`at most one power pump at ${h}:30`, s.filter((x) => x.power).length <= 1, true);
}

// --- the baby-feed (non-pumping) path is untouched by any of this
eq(
  "no power pump on the feed grid",
  computeSchedule(DEFAULT_SETTINGS, [], sleep, [], at(10, 0), { pumping: false }).filter((s) => s.power).length,
  0
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
