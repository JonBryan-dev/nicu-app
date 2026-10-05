// lib/weaning.ts — a gentle, dated step-down off the pump.
// One fewer session every few days; faster than every three is where
// engorgement and blocked ducts creep in. Pure functions; the Feeds tab
// drives the pumping planner from todayCount.
import { dayKey } from "@/lib/cares";

export const MIN_DAYS_PER_DROP = 3; // the floor most teams advise
export const COMFY_DAYS_PER_DROP = 4; // the pace we suggest by default

export interface WeanStage {
  count: number; // pumps a day during this stage
  from: Date;
  to: Date; // exclusive
  days: number;
}
export interface WeanPlan {
  stages: WeanStage[];
  todayCount: number;
  stageIndex: number; // -1 before start, stages.length once done
  nextDrop: Date | null;
  daysPerDrop: number;
  tooFast: boolean;
  done: boolean;
  daysLeft: number;
  totalDays: number;
}

const atNoon = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d + "T12:00:00") : new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const daysBetween = (a: Date, b: Date) => Math.round((+atNoon(b) - +atNoon(a)) / 86400e3);

/** The gentlest stop date from `from` for `count` pumps a day. */
export function suggestedStopDate(count: number, from: Date = new Date()): Date {
  return addDays(atNoon(from), Math.max(1, count) * COMFY_DAYS_PER_DROP);
}

export function weanPlan(startCount: number, started: Date | string, target: Date | string, today: Date = new Date()): WeanPlan {
  const d0 = atNoon(started);
  const t = atNoon(target);
  const now = atNoon(today);
  const drops = Math.max(1, Math.round(startCount));
  const totalDays = Math.max(1, daysBetween(d0, t));
  const per = totalDays / drops;
  const stages: WeanStage[] = [];
  for (let i = 0; i < drops; i++) {
    const from = addDays(d0, Math.round(i * per));
    const to = i === drops - 1 ? t : addDays(d0, Math.round((i + 1) * per));
    const days = Math.max(1, daysBetween(from, to));
    stages.push({ count: drops - i, from, to, days });
  }
  let stageIndex: number;
  if (now < d0) stageIndex = -1;
  else if (now >= t) stageIndex = stages.length;
  else stageIndex = Math.max(0, stages.findIndex((s) => now >= s.from && now < s.to));
  const done = stageIndex >= stages.length;
  const todayCount = stageIndex < 0 ? drops : done ? 0 : stages[stageIndex].count;
  const nextDrop = done ? null : stageIndex < 0 ? stages[0].to : stages[stageIndex].to;
  return {
    stages,
    todayCount,
    stageIndex,
    nextDrop,
    daysPerDrop: Math.round(per * 10) / 10,
    tooFast: per < MIN_DAYS_PER_DROP,
    done,
    daysLeft: Math.max(0, daysBetween(now, t)),
    totalDays,
  };
}

export const weanKey = (d: Date) => dayKey(d);
