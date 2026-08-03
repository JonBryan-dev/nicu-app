"use client";
// ParentJournal — a private, parents-only journal that lives behind a pill on
// the Updates tab. Family and team never see it (RLS enforces this too). Shared
// between mum & dad; each can delete only their own notes. No push — it's quiet
// on purpose. Returns a fragment; UpdatesTab supplies the <section> wrapper.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { fmtStamp } from "@/lib/dates";

type Entry = {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: { display_name: string } | null;
};

export default function ParentJournal() {
  const { supabase, profile, family } = useFamily();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("journal_entries")
      .select("id, author_id, body, created_at, author:profiles!journal_entries_author_id_fkey(display_name)")
      .eq("family_id", family.id)
      .order("created_at", { ascending: false });
    setEntries((data as unknown as Entry[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "journal_entries", family.id, load);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase
      .from("journal_entries")
      .insert({ family_id: family.id, author_id: profile.id, body: text });
    setBusy(false);
    if (!error) {
      setBody("");
      load();
    }
  }

  async function remove(id: string) {
    await supabase.from("journal_entries").delete().eq("id", id);
    load();
  }

  return (
    <>
      <div className="card journal">
        <h2>🔒 Mum &amp; Dad&apos;s journal</h2>
        <p className="note">
          Just for the two of you — the family and the team never see this. A place for the hard
          days, the wins, and the things you don&apos;t want to forget.
        </p>
        <form onSubmit={add}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="How are you, really? What happened today…"
            aria-label="Journal note"
          />
          <div className="composer-row">
            <span className="muted">Private to mum &amp; dad</span>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add to journal"}
            </button>
          </div>
        </form>
      </div>

      <div className="thread">
        {entries === null ? null : entries.length === 0 ? (
          <div className="empty">Nothing here yet — this space is yours.</div>
        ) : (
          entries.map((en) => (
            <div key={en.id} className="post journal-entry">
              <div className="meta">
                {en.author_id === profile.id ? "You" : en.author?.display_name ?? "Someone"} ·{" "}
                {fmtStamp(en.created_at)}
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>{en.body}</p>
              {en.author_id === profile.id && (
                <button type="button" className="tiny" onClick={() => remove(en.id)} aria-label="Delete note">
                  remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
