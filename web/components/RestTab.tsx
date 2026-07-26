"use client";
// Rest — weekly shift pattern grid (parents tap to cycle), wellbeing today
// (mum/dad lists, combined progress), respite this week.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, isoWeekKey } from "@/lib/dates";
import { ensurePeriodItems } from "@/lib/ensureItems";
import { ProgressBar, TickList } from "@/components/Checklist";
import {
  DAYS,
  BLOCKS,
  SHIFT_CYCLE,
  type ChecklistItem,
  type ShiftAssignee,
  type ShiftBlock,
} from "@/lib/types";

const STATE_LABEL: Record<ShiftAssignee, string> = {
  both: "Both",
  mum: "Mum",
  dad: "Dad",
  family: "Fam",
  rest: "—",
};

export default function RestTab() {
  const { supabase, family, isParent } = useFamily();
  const dayKey = todayKey();
  const weekKey = isoWeekKey(dayKey);

  const [shifts, setShifts] = useState<Record<string, ShiftAssignee>>({});
  const [wbMum, setWbMum] = useState<ChecklistItem[]>([]);
  const [wbDad, setWbDad] = useState<ChecklistItem[]>([]);
  const [respite, setRespite] = useState<ChecklistItem[]>([]);

  const loadShifts = useCallback(async () => {
    const { data } = await supabase
      .from("shift_blocks")
      .select("*")
      .eq("family_id", family.id)
      .eq("week_key", weekKey);
    const map: Record<string, ShiftAssignee> = {};
    for (const b of (data as ShiftBlock[]) ?? []) {
      map[`${b.day_name}-${b.block_name}`] = b.assignee;
    }
    setShifts(map);
  }, [supabase, family.id, weekKey]);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("family_id", family.id)
      .in("list_type", ["wellbeing_mum", "wellbeing_dad", "respite"])
      .in("scope_key", [dayKey, weekKey])
      .order("sort_order")
      .order("created_at");
    const items = (data as ChecklistItem[]) ?? [];
    setWbMum(items.filter((i) => i.list_type === "wellbeing_mum" && i.scope_key === dayKey));
    setWbDad(items.filter((i) => i.list_type === "wellbeing_dad" && i.scope_key === dayKey));
    setRespite(items.filter((i) => i.list_type === "respite" && i.scope_key === weekKey));
  }, [supabase, family.id, dayKey, weekKey]);

  useEffect(() => {
    (async () => {
      await ensurePeriodItems(supabase, family.id, isParent, "wellbeing_mum", dayKey);
      await ensurePeriodItems(supabase, family.id, isParent, "wellbeing_dad", dayKey);
      await ensurePeriodItems(supabase, family.id, isParent, "respite", weekKey);
      loadItems();
      loadShifts();
    })();
  }, [supabase, family.id, isParent, dayKey, weekKey, loadItems, loadShifts]);

  useRealtime(supabase, "shift_blocks", family.id, loadShifts);
  useRealtime(supabase, "checklist_items", family.id, loadItems);

  async function cycleShift(day: string, block: string) {
    if (!isParent) return;
    const cur = shifts[`${day}-${block}`] ?? "both";
    const next = SHIFT_CYCLE[(SHIFT_CYCLE.indexOf(cur) + 1) % SHIFT_CYCLE.length];
    setShifts((s) => ({ ...s, [`${day}-${block}`]: next }));
    await supabase.from("shift_blocks").upsert(
      {
        family_id: family.id,
        week_key: weekKey,
        day_name: day,
        block_name: block,
        assignee: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "family_id,week_key,day_name,block_name" }
    );
    loadShifts();
  }

  async function toggle(item: ChecklistItem) {
    await supabase
      .from("checklist_items")
      .update({ done: !item.done })
      .eq("id", item.id);
    loadItems();
  }

  const wbAll = [...wbMum, ...wbDad];

  return (
    <section>
      <div className="card">
        <h2>This week&apos;s shift pattern</h2>
        <p className="note">
          {isParent
            ? "Tap a block to change who's on. You don't both need to be bedside all day — the unit will call if anything changes."
            : "Who's with her, block by block, this week."}
        </p>
        <table className="shift" aria-label="Weekly shift pattern">
          <thead>
            <tr>
              <th />
              {DAYS.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BLOCKS.map((b) => (
              <tr key={b}>
                <th style={{ textAlign: "left" }}>{b}</th>
                {DAYS.map((d) => {
                  const st = shifts[`${d}-${b}`] ?? "both";
                  return (
                    <td key={d}>
                      <button
                        className={`chip ${st}`}
                        disabled={!isParent}
                        onClick={() => cycleShift(d, b)}
                        aria-label={`${d} ${b}: ${STATE_LABEL[st]}`}
                      >
                        {STATE_LABEL[st]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="legend">
          <span>
            <i style={{ background: "var(--rose-deep)" }} />
            Both
          </span>
          <span>
            <i style={{ background: "var(--rose)" }} />
            Mum
          </span>
          <span>
            <i style={{ background: "var(--sky)" }} />
            Dad
          </span>
          <span>
            <i style={{ background: "var(--sage)" }} />
            Family sit-in
          </span>
          <span>
            <i style={{ background: "var(--mist)" }} />
            Rest / off
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Wellbeing today</h2>
        <ProgressBar items={wbAll} />
        <h3>Mum</h3>
        <TickList items={wbMum} canEdit={isParent} onToggle={toggle} />
        <h3>Dad</h3>
        <TickList items={wbDad} canEdit={isParent} onToggle={toggle} />
      </div>

      <div className="card">
        <h2>Respite this week</h2>
        <p className="note">
          Aim to tick at least three. The guilt of leaving is normal — go
          anyway.
        </p>
        <ProgressBar items={respite} />
        <TickList items={respite} canEdit={isParent} onToggle={toggle} />
      </div>
    </section>
  );
}
