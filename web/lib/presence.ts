// lib/presence.ts — turn a day's shift-rota blocks into a single "who's at the
// hospital" read, so visitors know whether they'll see Mum, Dad, or both.
// Uses the same Mum/Dad/Both language as the Rest rota. An unset block defaults
// to "both" to match the rota grid; call with the three AM/PM/Eve assignees.
import type { ShiftAssignee } from "./types";

export type PresenceKind = "both" | "mum" | "dad" | "family" | "rest";
export type Presence = { kind: PresenceKind; label: string };

const LABEL: Record<PresenceKind, string> = {
  both: "Mum & Dad here",
  mum: "Mum here",
  dad: "Dad here",
  family: "Family sitting in",
  rest: "Parents resting",
};

/**
 * Summarise a day. Pass the assignees of its AM/PM/Eve blocks (use "both" for
 * any block with no row, matching the rota's default). Returns null only for an
 * empty list (caller decides a week with no rota shows nothing).
 */
export function daySummary(assignees: ShiftAssignee[]): Presence | null {
  if (!assignees.length) return null;
  const set = new Set(assignees);
  const bothParents = set.has("both") || (set.has("mum") && set.has("dad"));
  const kind: PresenceKind = bothParents
    ? "both"
    : set.has("mum")
    ? "mum"
    : set.has("dad")
    ? "dad"
    : set.has("family")
    ? "family"
    : "rest";
  return { kind, label: LABEL[kind] };
}
