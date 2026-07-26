"use client";
// Checklist — shared list UI for daily/weekly/wellbeing/respite items.
// Parents can tick/add/delete; family sees it read-only.
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
  onDelete,
}: {
  items: ChecklistItem[];
  canEdit: boolean;
  onToggle: (item: ChecklistItem) => void;
  onDelete?: (item: ChecklistItem) => void;
}) {
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
          {canEdit && onDelete && (
            <button
              className="tiny"
              onClick={() => onDelete(it)}
              aria-label={`Delete ${it.item_text}`}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
