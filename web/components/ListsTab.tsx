"use client";
// Lists — "Today" (daily, Europe/London date key) and "This week" (ISO week key).
// Calls ensure_period_items on load so fresh periods materialise from templates.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, isoWeekKey, fmtDate } from "@/lib/dates";
import { ensurePeriodItems } from "@/lib/ensureItems";
import { ProgressBar, TickList } from "@/components/Checklist";
import type { ChecklistItem, ListType } from "@/lib/types";

export default function ListsTab() {
  const { supabase, family, isParent } = useFamily();
  const dayKey = todayKey();
  const weekKey = isoWeekKey(dayKey);
  const [daily, setDaily] = useState<ChecklistItem[]>([]);
  const [weekly, setWeekly] = useState<ChecklistItem[]>([]);
  const [newDaily, setNewDaily] = useState("");
  const [newWeekly, setNewWeekly] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("family_id", family.id)
      .in("list_type", ["daily", "weekly"])
      .in("scope_key", [dayKey, weekKey])
      .order("sort_order")
      .order("created_at");
    const items = (data as ChecklistItem[]) ?? [];
    setDaily(items.filter((i) => i.list_type === "daily" && i.scope_key === dayKey));
    setWeekly(items.filter((i) => i.list_type === "weekly" && i.scope_key === weekKey));
  }, [supabase, family.id, dayKey, weekKey]);

  useEffect(() => {
    (async () => {
      await ensurePeriodItems(supabase, family.id, isParent, "daily", dayKey);
      await ensurePeriodItems(supabase, family.id, isParent, "weekly", weekKey);
      load();
    })();
  }, [supabase, family.id, isParent, dayKey, weekKey, load]);

  useRealtime(supabase, "checklist_items", family.id, load);

  async function toggle(item: ChecklistItem) {
    await supabase
      .from("checklist_items")
      .update({ done: !item.done })
      .eq("id", item.id);
    load();
  }

  async function remove(item: ChecklistItem) {
    await supabase.from("checklist_items").delete().eq("id", item.id);
    load();
  }

  async function add(listType: ListType, text: string, scopeKey: string) {
    const t = text.trim();
    if (!t) return;
    await supabase.from("checklist_items").insert({
      family_id: family.id,
      list_type: listType,
      scope_key: scopeKey,
      item_text: t,
      sort_order: 100,
    });
    load();
  }

  return (
    <section>
      <div className="card">
        <h2>
          Today <span className="muted">· {fmtDate(dayKey)}</span>
        </h2>
        <ProgressBar items={daily} />
        <TickList items={daily} canEdit={isParent} onToggle={toggle} onDelete={remove} />
        {isParent && (
          <form
            className="row"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              add("daily", newDaily, dayKey);
              setNewDaily("");
            }}
          >
            <input
              type="text"
              value={newDaily}
              onChange={(e) => setNewDaily(e.target.value)}
              placeholder="Add something for today…"
              aria-label="New daily item"
            />
            <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
              Add
            </button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          Resets fresh each morning.
        </p>
      </div>

      <div className="card">
        <h2>This week</h2>
        <ProgressBar items={weekly} />
        <TickList items={weekly} canEdit={isParent} onToggle={toggle} onDelete={remove} />
        {isParent && (
          <form
            className="row"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              add("weekly", newWeekly, weekKey);
              setNewWeekly("");
            }}
          >
            <input
              type="text"
              value={newWeekly}
              onChange={(e) => setNewWeekly(e.target.value)}
              placeholder="Add something for this week…"
              aria-label="New weekly item"
            />
            <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
              Add
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
