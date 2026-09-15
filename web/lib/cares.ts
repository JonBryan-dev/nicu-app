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
