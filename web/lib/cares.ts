// lib/cares.ts — Maisie's cares: the 4-hourly round. The step list lives here
// (not in the database) so the how-to text can be precise and easy to change.
// Position and foot-probe memory come from the last completed round.

export type CareStepKind = "tick" | "position" | "foot" | "temp" | "bedding";

export interface CareStep {
  key: string;
  title: string;
  how: string; // the bit you'd forget at 3am
  kind: CareStepKind;
  photo?: boolean; // offer a photo on this step
}

export const CARE_STEPS: CareStep[] = [
  { key: "nappy", title: "Nappy change", how: "Have a look at her skin while you're there.", kind: "tick" },
  { key: "mouth", title: "Mouth care", how: "Fresh gauze, gentle wipe around her mouth and lips.", kind: "tick" },
  {
    key: "eyes",
    title: "Eye care",
    how: "One gauze per wipe, per eye — inside corner outwards. New gauze for the second eye.",
    kind: "tick",
  },
  { key: "folds", title: "Neck, armpits, behind ears", how: "Check the creases are clean and dry.", kind: "tick" },
  { key: "foot", title: "Foot probe swap", how: "Move the sats probe to the other foot.", kind: "foot" },
  { key: "tprobe", title: "Temperature probe", how: "Flat against her skin, in the right spot, not under her.", kind: "tick" },
  { key: "temp", title: "Her temperature", how: "Usual range 36.5–37.5 °C.", kind: "temp" },
  { key: "position", title: "Reposition", how: "Rotate through the four — note what she was on and what's next.", kind: "position", photo: true },
  { key: "ng", title: "NG tube", how: "Still at the right marking, tape secure, nothing pulling.", kind: "tick" },
  { key: "highflow", title: "High flow", how: "Prongs sitting right, tubing not kinked or tugging.", kind: "tick" },
  { key: "bedding", title: "Bedding", how: "Change if soiled — and at least once every 24 hours.", kind: "bedding", photo: true },
];

export type Position = "left" | "back" | "right" | "prone";
export const POSITIONS: { value: Position; label: string; short: string }[] = [
  { value: "left", label: "Left side", short: "Left" },
  { value: "back", label: "On her back", short: "Back" },
  { value: "right", label: "Right side", short: "Right" },
  { value: "prone", label: "On her front", short: "Front" },
];
// left → back → right → front → left … keeps pressure moving round
const ROTATION: Position[] = ["left", "back", "right", "prone"];
export function nextPosition(last: Position | null): Position {
  if (!last) return "back";
  return ROTATION[(ROTATION.indexOf(last) + 1) % ROTATION.length];
}
export const positionLabel = (p: Position | null) =>
  POSITIONS.find((x) => x.value === p)?.label ?? "—";

export type Foot = "left" | "right";
export const otherFoot = (last: Foot | null): Foot => (last === "left" ? "right" : "left");

export function tempFlag(t: number | null): "low" | "high" | "ok" | null {
  if (t == null || isNaN(t)) return null;
  if (t < 36.5) return "low";
  if (t > 37.5) return "high";
  return "ok";
}

export interface CareSettings {
  round_interval_min: number;
  bedding_hours: number;
  notify_due: boolean;
  overdue_after_min: number;
  notify_feeds: boolean;
  feed_late_min: number;
}
export const DEFAULT_CARE_SETTINGS: CareSettings = {
  round_interval_min: 240,
  bedding_hours: 24,
  notify_due: true,
  overdue_after_min: 45,
  notify_feeds: true,
  feed_late_min: 30,
};

export interface CareRound {
  id: string;
  family_id: string;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  completed_by: string | null;
  position: Position | null;
  foot: Foot | null;
  temperature: number | null;
  bedding_changed: boolean;
  note: string | null;
  photo_paths: string[];
  steps_done?: number | null;
  starter?: { display_name: string } | null;
  finisher?: { display_name: string } | null;
}
export interface CareTick {
  round_id: string;
  key: string;
  done_by: string | null;
  done_at: string;
}

/** "in 1h 12m" / "due now" / "38m overdue" */
export function dueLabel(dueAt: Date, now: Date = new Date()): { text: string; state: "soon" | "due" | "late" | "ahead" } {
  const ms = +dueAt - +now;
  const mins = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span = h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  if (ms <= 0) return mins < 5 ? { text: "due now", state: "due" } : { text: `${span} overdue`, state: "late" };
  if (mins <= 30) return { text: `in ${span}`, state: "soon" };
  return { text: `in ${span}`, state: "ahead" };
}

export function hoursAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const mins = Math.round((+now - +new Date(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// ---- feeds: the ward's fixed grid, ticked one at a time ----
export interface FeedTick {
  id: string;
  family_id: string;
  due_at: string;
  done_at: string;
  done_by: string | null;
  ml: number | null;
  doer?: { display_name: string } | null;
}
export const FEED_ON_TIME_MIN = 20;

/** Every feed slot that falls inside one calendar day (local time). */
export function feedSlots(first: string, intervalMin: number, day: Date = new Date()): Date[] {
  const [h, m] = first.split(":").map(Number);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const anchor = new Date(dayStart);
  anchor.setDate(anchor.getDate() - 1);
  anchor.setHours(h, m, 0, 0);
  const out: Date[] = [];
  for (let t = anchor; t < dayEnd; t = new Date(+t + intervalMin * 60000)) {
    if (t >= dayStart) out.push(new Date(t));
  }
  return out;
}

/** The slot we're in now (most recent at or before `now`) and the one after. */
export function feedSlotNow(first: string, intervalMin: number, now: Date = new Date()): { current: Date; next: Date } {
  const yday = new Date(now);
  yday.setDate(yday.getDate() - 1);
  const all = [...feedSlots(first, intervalMin, yday), ...feedSlots(first, intervalMin, now)];
  let current = all[0];
  for (const t of all) if (t <= now) current = t;
  return { current, next: new Date(+current + intervalMin * 60000) };
}

export const feedOnTime = (t: FeedTick) =>
  +new Date(t.done_at) - +new Date(t.due_at) <= FEED_ON_TIME_MIN * 60000;

/** Consecutive on-time feeds counting back from the last slot that's had a
 *  chance to be ticked. A missed slot, or a late tick, ends the run. */
export function feedStreak(first: string, intervalMin: number, ticks: FeedTick[], now: Date = new Date()): number {
  const byDue = new Map(ticks.map((t) => [+new Date(t.due_at), t]));
  const { current } = feedSlotNow(first, intervalMin, now);
  // don't count the current slot against them until it's actually late
  let t = +now - +current > FEED_ON_TIME_MIN * 60000 ? +current : +current - intervalMin * 60000;
  let streak = 0;
  for (let i = 0; i < 7 * Math.ceil(1440 / intervalMin); i++, t -= intervalMin * 60000) {
    const tick = byDue.get(t);
    if (!tick || !feedOnTime(tick)) break;
    streak++;
  }
  return streak;
}

// ---- scoring: the whole section is built to be worth checking ----
export const CARE_ON_TIME_MIN = 60; // a round within the hour of due counts as on time
export const POINTS = {
  feedOnTime: 10,
  feedLate: 5,
  round: 20,
  roundOnTime: 10,
  fullRound: 5,
  bedding: 5,
  photo: 2,
  photoCap: 6,
} as const;

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const feedTickPoints = (t: FeedTick) => (feedOnTime(t) ? POINTS.feedOnTime : POINTS.feedLate);

/** Was this round finished within the hour of when it was due (one interval
 *  after the previous finished round)? The first round ever is on time. */
export function roundOnTime(r: CareRound, prev: CareRound | null, intervalMin: number): boolean {
  if (!r.completed_at) return false;
  if (!prev?.completed_at) return true;
  const due = +new Date(prev.completed_at) + intervalMin * 60000;
  return +new Date(r.completed_at) <= due + CARE_ON_TIME_MIN * 60000;
}

export interface RoundScore {
  points: number;
  onTime: boolean;
  full: boolean;
  steps: number;
}
export function scoreRound(r: CareRound, prev: CareRound | null, intervalMin: number, steps: number): RoundScore {
  const onTime = roundOnTime(r, prev, intervalMin);
  const full = steps >= CARE_STEPS.length;
  const photos = Math.min(POINTS.photoCap, (r.photo_paths?.length ?? 0) * POINTS.photo);
  const points =
    POINTS.round +
    (onTime ? POINTS.roundOnTime : 0) +
    (full ? POINTS.fullRound : 0) +
    (r.bedding_changed ? POINTS.bedding : 0) +
    photos;
  return { points, onTime, full, steps };
}

/** Consecutive on-time rounds, counting back from the latest. `asc` is every
 *  completed round oldest → newest. */
export function careStreak(asc: CareRound[], intervalMin: number): number {
  let streak = 0;
  for (let i = asc.length - 1; i >= 0; i--) {
    if (!roundOnTime(asc[i], i > 0 ? asc[i - 1] : null, intervalMin)) break;
    streak++;
  }
  return streak;
}

export const LEVELS: { at: number; name: string }[] = [
  { at: 0, name: "Cotside rookie" },
  { at: 250, name: "Steady hands" },
  { at: 1000, name: "Night-shift regular" },
  { at: 2500, name: "Cotside pro" },
  { at: 5000, name: "{baby}'s A-team" },
  { at: 10000, name: "NICU legend" },
];
export function levelFor(points: number, baby: string) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const progress = next ? (points - cur.at) / (next.at - cur.at) : 1;
  return { index: i + 1, name: cur.name.replace("{baby}", baby), next, progress: Math.max(0, Math.min(1, progress)) };
}

export interface Badge {
  key: string;
  emoji: string;
  name: string;
  how: string;
  earned: boolean;
}
export interface BadgeInput {
  rounds: CareRound[]; // all completed, any order
  stepsFor: (r: CareRound) => number;
  ticks: FeedTick[]; // all feed ticks
  feedPlan: { first: string; every: number } | null;
  feedStreak: number;
  now: Date;
}
export function computeBadges(inp: BadgeInput): Badge[] {
  const done = inp.rounds.filter((r) => r.completed_at);
  const hour = (r: CareRound) => new Date(r.completed_at!).getHours();
  const byDay = new Map<string, CareRound[]>();
  for (const r of done) {
    const k = dayKey(new Date(r.completed_at!));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(r);
  }
  const days = [...byDay.keys()].sort();
  const photos = done.reduce((a, r) => a + (r.photo_paths?.length ?? 0), 0);

  // clean sheets: bedding changed on 3 consecutive calendar days
  const bedDays = new Set(done.filter((r) => r.bedding_changed).map((r) => dayKey(new Date(r.completed_at!))));
  let cleanRun = 0;
  for (const d of [...bedDays].sort()) {
    const prev = new Date(d + "T12:00:00");
    prev.setDate(prev.getDate() - 1);
    cleanRun = bedDays.has(dayKey(prev)) ? cleanRun + 1 : 1;
    if (cleanRun >= 3) break;
  }

  // perfect day: every feed slot of a day ticked on time (days since the first tick)
  let perfect = false;
  if (inp.feedPlan && inp.ticks.length) {
    const tickByDue = new Map(inp.ticks.map((t) => [+new Date(t.due_at), t]));
    const firstTick = inp.ticks.reduce((a, t) => Math.min(a, +new Date(t.due_at)), Infinity);
    const today = dayKey(inp.now);
    for (let back = 1; back <= 14 && !perfect; back++) {
      const d = new Date(inp.now);
      d.setDate(d.getDate() - back);
      if (dayKey(d) === today) continue;
      const slots = feedSlots(inp.feedPlan.first, inp.feedPlan.every, d);
      if (!slots.length || +slots[0] < firstTick) continue;
      perfect = slots.every((s) => {
        const t = tickByDue.get(+s);
        return t && feedOnTime(t);
      });
    }
  }

  const list: Badge[] = [
    { key: "early", emoji: "🌅", name: "Early bird", how: "Finish a round between 4 and 7am", earned: done.some((r) => hour(r) >= 4 && hour(r) < 7) },
    { key: "owl", emoji: "🦉", name: "Night owl", how: "Finish a round between midnight and 4am", earned: done.some((r) => hour(r) < 4) },
    { key: "full", emoji: "🏠", name: "Full house", how: "Tick every step in one round", earned: done.some((r) => inp.stepsFor(r) >= CARE_STEPS.length) },
    { key: "perfect", emoji: "🎯", name: "Perfect day", how: "Every feed of a day ticked on time", earned: perfect },
    { key: "sheets", emoji: "🛏", name: "Clean sheets", how: "Fresh bedding three days running", earned: cleanRun >= 3 },
    { key: "four", emoji: "🔄", name: "All four", how: "All four positions in one day", earned: days.some((d) => new Set(byDay.get(d)!.map((r) => r.position).filter(Boolean)).size >= 4) },
    { key: "team", emoji: "🤝", name: "Tag team", how: "You both finish a round on the same day", earned: days.some((d) => new Set(byDay.get(d)!.map((r) => r.completed_by).filter(Boolean)).size >= 2) },
    { key: "roll", emoji: "🔥", name: "On a roll", how: "A full day of feeds on time in a row", earned: inp.feedPlan ? inp.feedStreak >= Math.round(1440 / inp.feedPlan.every) : false },
    { key: "snap", emoji: "📷", name: "Snapper", how: "Ten photos on rounds", earned: photos >= 10 },
    { key: "century", emoji: "💯", name: "Century", how: "One hundred rounds finished", earned: done.length >= 100 },
  ];
  return list;
}
