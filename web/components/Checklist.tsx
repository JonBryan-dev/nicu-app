"use client";
// Checklist — shared list UI for daily/weekly/wellbeing/respite items.
// Parents can tick/add/delete; family sees it read-only. Routine items
// (from templates) offer "just today" vs "every day" on removal.
import { useState } from "react";
import type { ChecklistItem } from "@/lib/types";

export function ProgressBar({ items }: { items: ChecklistItem[] }) {
  const pct = items.length
    ? Math.round((100 * items.filter((i) => i.done).length) / items.length)
    : 0;
  return (
    <div className="progress">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TickList({
  items,
  canEdit,
  onToggle,
  onSkipToday,
  onRemoveForever,
}: {
  items: ChecklistItem[];
  canEdit: boolean;
  onToggle: (item: ChecklistItem) => void;
  /** hide a routine item for this period only (it returns next period) */
  onSkipToday?: (item: ChecklistItem) => void;
  /** delete a one-off item, or a routine item from every future day */
  onRemoveForever?: (item: ChecklistItem) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div>
      {items.map((it) => (
        <div key={it.id} className={`tick ${it.done ? "done" : ""}`}>
          <input
            type="checkbox"
            checked={it.done}
            disabled={!canEdit}
            onChange={() => onToggle(it)}
            aria-label={it.item_text}
          />
          <span>{it.item_text}</span>
          {canEdit && onRemoveForever && (
            confirmId === it.id && it.template_id && onSkipToday ? (
              <span className="removepick">
                <button
                  className="tiny"
                  onClick={() => {
                    onSkipToday(it);
                    setConfirmId(null);
                  }}
                >
                  just today
                </button>
                <button
                  className="tiny"
                  style={{ color: "var(--rose-deep)" }}
                  onClick={() => {
                    onRemoveForever(it);
                    setConfirmId(null);
                  }}
                >
                  every day
                </button>
                <button className="tiny" onClick={() => setConfirmId(null)}>
                  ✕
                </button>
              </span>
            ) : (
              <button
                className="tiny"
                onClick={() =>
                  it.template_id && onSkipToday
                    ? setConfirmId(it.id)
                    : onRemoveForever(it)
                }
                aria-label={`Remove ${it.item_text}`}
              >
                ✕
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}
