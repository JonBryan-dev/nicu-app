"use client";
// ParentJournal — a private, parents-only stream of notes. Used twice in the
// Journal tab: kind="journal" (the free-write journal) and kind="vent" (issues
// with nurses / doctors / the unit — somewhere to put it that isn't the family
// feed). Family and team never see any of it (RLS enforces this too). Shared
// between mum & dad; each can delete only their own. Quiet on purpose — no push.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { fmtStamp } from "@/lib/dates";

type Entry = {
  id: string;
  author_id: string | null;
  body: string;
  title: string | null;
  kind: string;
  created_at: string;
  author?: { display_name: string } | null;
};

export default function ParentJournal({
  kind = "journal",
  heading = "🔒 Mum & Dad's journal",
  intro = "Just for the two of you — the family and the team never see this. A place for the hard days, the wins, and the things you don't want to forget.",
  placeholder = "How are you, really? What happened today…",
  button = "Add to journal",
  emptyText = "Nothing here yet — this space is yours.",
  withTitle = false,
  titlePlaceholder = "",
}: {
  kind?: "journal" | "vent";
  heading?: string;
  intro?: string;
  placeholder?: string;
  button?: string;
  emptyText?: string;
  withTitle?: boolean;
  titlePlaceholder?: string;
}) {
  const { supabase, profile, family } = useFamily();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, author_id, body, title, kind, created_at, author:profiles!journal_entries_author_id_fkey(display_name)")
      .eq("family_id", family.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    if (error && /kind/.test(error.message)) {
      // migration 030 not run yet — fall back to everything (all "journal")
      const { data: all } = await supabase
        .from("journal_entries")
        .select("id, author_id, body, created_at, author:profiles!journal_entries_author_id_fkey(display_name)")
        .eq("family_id", family.id)
        .order("created_at", { ascending: false });
      setEntries(kind === "journal" ? ((all as unknown as Entry[]) ?? []) : []);
      return;
    }
    setEntries((data as unknown as Entry[]) ?? []);
  }, [supabase, family.id, kind]);

  useEffect(() => { load(); }, [load]);
  useRealtime(supabase, "journal_entries", family.id, load);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr("");
    const row: Record<string, unknown> = { family_id: family.id, author_id: profile.id, body: text };
    if (kind !== "journal") row.kind = kind;
    if (withTitle && title.trim()) row.title = title.trim();
    const { error } = await supabase.from("journal_entries").insert(row);
    setBusy(false);
    if (error) {
      setErr(/kind|title/.test(error.message) ? "This needs migration 030 in the database first." : error.message);
      return;
    }
    setBody("");
    setTitle("");
    load();
  }

  async function remove(id: string) {
    await supabase.from("journal_entries").delete().eq("id", id);
    load();
  }

  return (
    <>
      <div className={`card journal ${kind === "vent" ? "vent" : ""}`}>
        <h2>{heading}</h2>
        <p className="note">{intro}</p>
        <form onSubmit={add}>
          {withTitle && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titlePlaceholder}
              aria-label="Title"
              style={{ marginBottom: 8 }}
            />
          )}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} aria-label="Note" />
          <div className="composer-row">
            <span className="muted">Private to mum &amp; dad</span>
            <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : button}</button>
          </div>
          {err && <p className="err">{err}</p>}
        </form>
      </div>

      <div className="thread">
        {entries === null ? null : entries.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : (
          entries.map((en) => (
            <div key={en.id} className={`post journal-entry ${kind === "vent" ? "vent" : ""}`}>
              <div className="meta">
                {en.author_id === profile.id ? "You" : en.author?.display_name ?? "Someone"} · {fmtStamp(en.created_at)}
              </div>
              {en.title && <p style={{ fontWeight: 700, marginBottom: 2 }}>{en.title}</p>}
              <p style={{ whiteSpace: "pre-wrap" }}>{en.body}</p>
              {en.author_id === profile.id && (
                <button type="button" className="tiny" onClick={() => remove(en.id)} aria-label="Delete note">remove</button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
