"use client";
// EvidenceTab — "Lungs": dad's private evidence corner. Three views:
//   Evidence — Cochrane reviews by topic, authors' conclusions quoted verbatim,
//              each with hand-written questions to put to the team.
//   Timeline — her actual breathing journey, derived from the gases already
//              logged plus anything hand-logged, beside the cohort figures.
//   Words    — a plain-English glossary of what's on the screen above her cot.
//
// Reviews resolve in three layers so the tab is never empty and never silent:
// the committed snapshot, then this phone's last successful fetch, then a live
// call to /api/evidence. Hospital wifi is assumed to be terrible.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { MODES, type SupportMode } from "@/lib/gas";
import {
  BANNER,
  COHORT,
  COHORT_NOTE,
  COHORT_SOURCE,
  FOOTER,
  GLOSSARY,
  TOPICS,
  byTopic,
  hedgeFlag,
  questionsFor,
  type Review,
} from "@/lib/evidence";
import { SNAPSHOT, SNAPSHOT_FETCHED } from "@/lib/evidence-snapshot";
import { baseCd, doiUrl, latestVersions, pubmedUrl } from "@/lib/pubmed";
import {
  EVENT_LABEL,
  LOGGABLE_KINDS,
  compareToCohort,
  derivedEvents,
  ladderFromGases,
  mergeEvents,
  respStats,
  type EventKind,
  type RespEventRow,
} from "@/lib/respTimeline";

const CACHE_KEY = "evidence-cache-v1";
type Cached = { reviews: Review[]; fetchedAt: string };

const readCache = (): Cached | null => {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? (JSON.parse(s) as Cached) : null;
  } catch {
    return null;
  }
};
const writeCache = (c: Cached) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* private mode */
  }
};

const localNow = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The six-rung support ladder, current rung lit. */
function Ladder({ current }: { current: SupportMode | null }) {
  return (
    <div className="ladder" role="img" aria-label={`Support ladder, currently ${current ?? "unknown"}`}>
      {[...MODES].reverse().map((m) => (
        <div key={m.id} className={`ladder-rung${m.id === current ? " on" : ""}`}>
          {m.label}
        </div>
      ))}
    </div>
  );
}

export default function EvidenceTab() {
  const { supabase, profile, family, isParent, isDad } = useFamily();
  const [view, setView] = useState<"evidence" | "timeline" | "words">("evidence");

  // ---------- reviews ----------
  const [reviews, setReviews] = useState<Review[]>(SNAPSHOT);
  const [fetchedAt, setFetchedAt] = useState<string>(SNAPSHOT_FETCHED);
  const [live, setLive] = useState(false);
  const [checking, setChecking] = useState(false);

  const applyReviews = useCallback((incoming: Review[], when: string) => {
    // merge over whatever we already have, newest version of each review wins
    setReviews((prev) => {
      const merged = TOPICS.flatMap((t) =>
        latestVersions([...prev, ...incoming].filter((r) => r.topic === t.id))
      );
      return merged;
    });
    setFetchedAt(when);
  }, []);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/evidence");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reviews: Review[]; fetchedAt: string | null; mode: string };
      if (data.mode === "live" && data.reviews.length) {
        applyReviews(data.reviews, data.fetchedAt ?? "");
        setLive(true);
        writeCache({ reviews: data.reviews, fetchedAt: data.fetchedAt ?? "" });
      }
    } catch {
      /* the snapshot and the cache are still there — say nothing, show nothing broken */
    }
    setChecking(false);
  }, [applyReviews]);

  useEffect(() => {
    const c = readCache();
    if (c?.reviews?.length) {
      applyReviews(c.reviews, c.fetchedAt);
      setLive(true);
    }
    checkForUpdates();
  }, [applyReviews, checkForUpdates]);

  // ---------- her timeline ----------
  const [gases, setGases] = useState<{ taken_at: string; support_mode: SupportMode | null }[]>([]);
  const [logged, setLogged] = useState<RespEventRow[]>([]);
  const [form, setForm] = useState({ kind: "extubation" as EventKind, at: localNow(), detail: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loadTimeline = useCallback(async () => {
    const [g, e] = await Promise.all([
      supabase
        .from("gas_entries")
        .select("taken_at, support_mode")
        .eq("family_id", family.id)
        .order("taken_at"),
      supabase.from("resp_events").select("id, kind, at, detail, note").order("at"),
    ]);
    if (g.data) setGases(g.data as { taken_at: string; support_mode: SupportMode | null }[]);
    if (e.data) setLogged(e.data as RespEventRow[]);
  }, [supabase, family.id]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);
  useRealtime(supabase, "resp_events", family.id, loadTimeline);
  useRealtime(supabase, "gas_entries", family.id, loadTimeline);

  const ladder = useMemo(() => ladderFromGases(gases), [gases]);
  const events = useMemo(() => mergeEvents(derivedEvents(ladder), logged), [ladder, logged]);
  const stats = useMemo(
    () => respStats(ladder, events, family.baby_dob, new Date().toISOString().slice(0, 10)),
    [ladder, events, family.baby_dob]
  );
  const comparisons = useMemo(
    () => compareToCohort(stats, family.gestation_days ?? null),
    [stats, family.gestation_days]
  );

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    const { error } = await supabase.from("resp_events").insert({
      family_id: family.id,
      author_id: profile.id,
      kind: form.kind,
      at: new Date(form.at).toISOString(),
      detail: form.detail.trim() || null,
      note: form.note.trim() || null,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setForm({ kind: "extubation", at: localNow(), detail: "", note: "" });
    loadTimeline();
  }

  async function removeEvent(id: string) {
    await supabase.from("resp_events").delete().eq("id", id);
    loadTimeline();
  }

  // ---------- glossary ----------
  const [filter, setFilter] = useState("");
  const terms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return GLOSSARY;
    return GLOSSARY.filter(
      (g) =>
        g.term.toLowerCase().includes(q) ||
        (g.expand ?? "").toLowerCase().includes(q) ||
        g.plain.toLowerCase().includes(q)
    );
  }, [filter]);

  if (!isParent || !isDad) {
    return (
      <section>
        <div className="card">
          <div className="empty">This corner belongs to someone else.</div>
        </div>
      </section>
    );
  }

  const groups = byTopic(reviews);
  const eventsByDay = events.reduce<Record<string, typeof events>>((acc, ev) => {
    const k = ev.at.slice(0, 10);
    (acc[k] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <section>
      <div className="gas-banner">{BANNER}</div>

      <div className="viewtabs" role="tablist">
        <button role="tab" aria-selected={view === "evidence"} className={view === "evidence" ? "on" : ""} onClick={() => setView("evidence")}>
          Evidence
        </button>
        <button role="tab" aria-selected={view === "timeline"} className={view === "timeline" ? "on" : ""} onClick={() => setView("timeline")}>
          Timeline
        </button>
        <button role="tab" aria-selected={view === "words"} className={view === "words" ? "on" : ""} onClick={() => setView("words")}>
          Words
        </button>
      </div>

      {/* ---------------- Evidence ---------------- */}
      {view === "evidence" && (
        <>
          <div className="card">
            <div className="gas-kicker">Cohort context</div>
            <h2>The shape of the road</h2>
            <ul className="ev-list">
              {COHORT.map((c) => (
                <li key={c.stat}>
                  <b>{c.stat}</b> {c.detail}
                  <div className="ev-sub">
                    <span className="badge">{COHORT_SOURCE}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="note">{COHORT_NOTE}</p>
          </div>

          <div className="row" style={{ alignItems: "center", margin: "0 0 12px" }}>
            <span className="muted" style={{ flex: 1 }}>
              {live && fetchedAt
                ? `Updated ${fetchedAt}`
                : SNAPSHOT_FETCHED
                  ? `From the built-in library — last refreshed ${SNAPSHOT_FETCHED}`
                  : "No reviews downloaded on this phone yet."}
            </span>
            <button className="ghost" style={{ flex: "0 0 auto" }} onClick={checkForUpdates} disabled={checking}>
              {checking ? "Checking…" : "Check for updates"}
            </button>
          </div>

          {!groups.length && (
            <div className="card">
              <div className="empty">
                Nothing downloaded yet. Tap <b>Check for updates</b> when you have a bar of signal —
                the reviews are then kept on this phone and work offline.
              </div>
            </div>
          )}

          {groups.map(({ topic, reviews: rs }) => (
            <div className="card" key={topic.id}>
              <div className="gas-kicker">{rs.length} review{rs.length === 1 ? "" : "s"}</div>
              <h2>{topic.label}</h2>
              <p className="note">{topic.blurb}</p>
              <div className="thread">
                {rs.map((r) => {
                  const cd = baseCd(r.doi);
                  const hedge = hedgeFlag(r.conclusions);
                  return (
                    <article className="post" key={r.pmid}>
                      <div className="meta">
                        {r.year ?? "—"} · Cochrane{cd ? ` · ${cd}` : ""}
                      </div>
                      <h3 style={{ margin: "2px 0 6px", fontSize: "0.98rem" }}>{r.title}</h3>
                      {r.conclusions ? (
                        <details>
                          <summary className="muted">Authors&apos; conclusions</summary>
                          <blockquote className="ev-quote">{r.conclusions}</blockquote>
                          {hedge && <p className="note">{hedge}</p>}
                        </details>
                      ) : (
                        <p className="muted">No structured conclusion in the abstract.</p>
                      )}
                      <details>
                        <summary className="muted">Questions this raises for the team</summary>
                        <ul className="ev-list">
                          {questionsFor(r, cd).map((q) => (
                            <li key={q.id}>
                              <b>{q.q}</b>
                              <div className="ev-sub">{q.why}</div>
                            </li>
                          ))}
                        </ul>
                      </details>
                      <div className="muted" style={{ marginTop: 6 }}>
                        <a href={pubmedUrl(r.pmid)} target="_blank" rel="noreferrer">
                          PubMed
                        </a>
                        {r.doi && (
                          <>
                            {" · "}
                            <a href={doiUrl(r.doi)} target="_blank" rel="noreferrer">
                              Full review
                            </a>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------------- Timeline ---------------- */}
      {view === "timeline" && (
        <>
          <div className="card">
            <div className="gas-kicker">Where she is now</div>
            <h2>
              {stats.currentMode
                ? MODES.find((m) => m.id === stats.currentMode)?.label
                : "No support logged yet"}
            </h2>
            <Ladder current={stats.currentMode} />
            {stats.daysAtCurrentMode !== null && (
              <p className="note">
                {stats.daysAtCurrentMode === 0
                  ? "Since today."
                  : `${stats.daysAtCurrentMode} day${stats.daysAtCurrentMode === 1 ? "" : "s"} on this rung.`}
              </p>
            )}
            {stats.sampleGapDays > 2 && (
              <p className="muted">
                This is built from the gases you&apos;ve logged. The biggest gap between them is{" "}
                {stats.sampleGapDays} days, so anything that changed and changed back inside a gap
                won&apos;t show here.
              </p>
            )}
          </div>

          {comparisons.length > 0 && (
            <div className="card">
              <div className="gas-kicker">Her numbers, and the cohort&apos;s</div>
              <h2>So far</h2>
              <ul className="ev-list">
                {comparisons.map((c) => (
                  <li key={c.label}>
                    <b>
                      {c.label}: {c.value}
                    </b>
                    <div className="ev-sub">
                      <span className="badge">{COHORT_SOURCE}</span> {c.typical}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="note">{COHORT_NOTE}</p>
            </div>
          )}

          <div className="card">
            <h2>Log an event</h2>
            <p className="note">
              Only for what a blood gas can&apos;t say — a surfactant dose, the day caffeine started,
              the exact hour of an extubation. Everything else is worked out from your gases.
            </p>
            <form onSubmit={addEvent}>
              <label htmlFor="ev-kind">What happened</label>
              <select
                id="ev-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as EventKind })}
              >
                {LOGGABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {EVENT_LABEL[k]}
                  </option>
                ))}
              </select>
              <label htmlFor="ev-at">When</label>
              <input
                id="ev-at"
                type="datetime-local"
                value={form.at}
                onChange={(e) => setForm({ ...form, at: e.target.value })}
              />
              <label htmlFor="ev-detail">Detail (optional)</label>
              <input
                id="ev-detail"
                type="text"
                value={form.detail}
                placeholder="dose 2, planned trial, moved to CPAP…"
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
              />
              <label htmlFor="ev-note">Your note (optional)</label>
              <textarea
                id="ev-note"
                rows={2}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add to the timeline"}
              </button>
            </form>
            {err && <p className="err">{err}</p>}
          </div>

          {!events.length ? (
            <div className="card">
              <div className="empty">
                Nothing on the timeline yet. It fills itself in as you log blood gases.
              </div>
            </div>
          ) : (
            Object.entries(eventsByDay)
              .sort((a, b) => (a[0] < b[0] ? 1 : -1))
              .map(([day, evs]) => (
                <div className="card" key={day}>
                  <div className="datehead">
                    <span className="datehead-d">{fmtDay(day)}</span>
                  </div>
                  <div className="thread">
                    {evs.map((ev, i) => (
                      <article className="post" key={ev.id ?? `${ev.at}-${i}`}>
                        <div className="meta">
                          {fmtDateTime(ev.at)} ·{" "}
                          <span className="badge">
                            {ev.source === "gas" ? "from your gases" : "you logged this"}
                          </span>
                        </div>
                        <b>{ev.label}</b>
                        {ev.detail && <div className="ev-sub">{ev.detail}</div>}
                        {ev.note && <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{ev.note}</p>}
                        {ev.id && (
                          <button
                            className="tiny"
                            onClick={() => removeEvent(ev.id!)}
                            aria-label={`Delete ${ev.label}`}
                          >
                            delete
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              ))
          )}
        </>
      )}

      {/* ---------------- Words ---------------- */}
      {view === "words" && (
        <div className="card">
          <h2>Words on the screen above her cot</h2>
          <label htmlFor="ev-filter">Find a word</label>
          <input
            id="ev-filter"
            type="text"
            value={filter}
            placeholder="PEEP, caffeine, corrected age…"
            onChange={(e) => setFilter(e.target.value)}
          />
          {!terms.length && <div className="empty">Nothing matching that one.</div>}
          <ul className="ev-list">
            {terms.map((g) => (
              <li key={g.term}>
                <b>{g.term}</b>
                {g.expand && <span className="ev-sub"> {g.expand}</span>}
                <div style={{ marginTop: 2 }}>{g.plain}</div>
              </li>
            ))}
          </ul>
          <p className="muted">
            For everything else, Bliss keeps a fuller list:{" "}
            <a
              href="https://www.bliss.org.uk/parents/in-hospital/about-neonatal-care/words-you-might-hear-on-the-neonatal-unit"
              target="_blank"
              rel="noreferrer"
            >
              words you might hear on the neonatal unit
            </a>
            .
          </p>
        </div>
      )}

      <p className="note">{FOOTER}</p>
    </section>
  );
}
