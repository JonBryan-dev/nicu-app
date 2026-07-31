"use client";
// ParentPresence — a small "Today: Mum & Dad here" banner from the Rest rota,
// shown on every tab so anyone (family included) can see who's at the hospital.
// Silent until the week's rota has been set, so it never over-claims.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, isoWeekKey, dayName } from "@/lib/dates";
import { daySummary, type Presence } from "@/lib/presence";
import { BLOCKS, type ShiftAssignee, type ShiftBlock } from "@/lib/types";

export default function ParentPresence() {
  const { supabase, family } = useFamily();
  const [today, setToday] = useState<Presence | null>(null);

  const load = useCallback(async () => {
    const wk = isoWeekKey(todayKey());
    const { data } = await supabase
      .from("shift_blocks")
      .select("day_name, block_name, assignee")
      .eq("family_id", family.id)
      .eq("week_key", wk);
    const rows = (data as ShiftBlock[]) ?? [];
    if (!rows.length) {
      setToday(null);
      return;
    }
    const dn = dayName(todayKey());
    const map: Record<string, ShiftAssignee> = {};
    for (const r of rows) map[`${r.day_name}-${r.block_name}`] = r.assignee;
    const assignees = BLOCKS.map((b) => map[`${dn}-${b}`] ?? "both");
    setToday(daySummary(assignees));
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "shift_blocks", family.id, load);

  if (!today) return null;
  return (
    <div className={`presence presence-${today.kind}`} role="status">
      <span className="presence-dot" aria-hidden="true" />
      <span>Today · {today.label}</span>
    </div>
  );
}
