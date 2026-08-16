"use client";
// JournalTab — "Our NICU Companion" for mum & dad, next to Updates:
// journey tracker · today's question for the team · something positive today ·
// parent wellbeing check-in · nurse/doctor issues vent · private journal ·
// ask-me-anything chat (knowledge-base-locked, streaming, offline fallback) ·
// support directory · export. Every factual string comes from lib/companion.ts
// (Bliss + RCPCH only). Parents-only.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtStamp } from "@/lib/dates";
import ParentJournal from "@/components/ParentJournal";
import {
  FOOTER, POSITIVE_FACTS, QUESTIONS, WELLBEING, SUPPORT_LINKS, STARTER_CHIPS,
  pick, journey, offlineAnswer,
} from "@/lib/companion";

type Mood = "rough day" | "okay" | "good day";
type Msg = { role: "user" | "assistant"; content: string };
const CHAT_KEY = "companion-chat-v1";

export default function JournalTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const today = todayKey();
  const first = family.baby_name.split(" ")[0];

  // ----- journey tracker
  const j = family.gestation_days ? journey(family.baby_dob, family.gestation_days, today) : null;

  // ----- today's question
  const [qOffset, setQOffset] = useState(0);
  const q = pick(QUESTIONS, today, qOffset);
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState<{ id: string; title: string | null; body: string; created_at: string }[]>([]);
  const [moodToday, setMoodToday] = useState<Mood | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, kind, title, body, created_at")
      .eq("family_id", family.id)
      .in("kind", ["question", "mood"])
      .order("created_at", { ascending: false });
    if (error) return; // migration 030 not run — sections still render, saving will explain
    const rows = (data as { id: string; kind: string; title: string | null; body: string; created_at: string }[]) ?? [];
    setAsked(rows.filter((r) => r.kind === "question").slice(0, 8));
    const m = rows.find((r) => r.kind === "mood" && r.created_at.slice(0, 10) === today);
    setMoodToday((m?.body as Mood) ?? null);
  }, [supabase, family.id, today]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useRealtime(supabase, "journal_entries", family.id, loadLogs);

  async function saveKind(kind: "question" | "mood", title: string, body: string) {
    setSaveMsg("");
    const { error } = await supabase.from("journal_entries").insert({ family_id: family.id, author_id: profile.id, kind, title, body });
    if (error) {
      setSaveMsg(/kind|title/.test(error.message) ? "This needs migration 030 in the database first." : error.message);
      return false;
    }
    loadLogs();
    return true;
  }
  async function saveAsked() {
    if (await saveKind("question", q.q, answer.trim() || "(asked — no notes)")) {
      setAnswer(""); setAnswering(false); setSaveMsg("Saved to your journal 💛");
    }
  }
  async function logMood(m: Mood) {
    if (await saveKind("mood", pick(WELLBEING, today), m)) setMoodToday(m);
  }

  // ----- positive fact + wellbeing prompt (deterministic per day)
  const fact = pick(POSITIVE_FACTS, today);
  const wb = pick(WELLBEING, today);

  // ----- chat
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<"live" | "offline" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { const s = localStorage.getItem(CHAT_KEY); if (s) setMsgs(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || streaming) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/companion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      setMode(res.headers.get("X-Companion-Mode") === "live" ? "live" : "offline");
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
    } catch {
      setMode("offline");
      setMsgs([...next, { role: "assistant", content: offlineAnswer(t) }]);
    }
    setStreaming(false);
  }

  // ----- export journal as text
  async function exportJournal() {
    const { data } = await supabase
      .from("journal_entries")
      .select("kind, title, body, created_at")
      .eq("family_id", family.id)
      .order("created_at");
    const rows = (data as { kind?: string; title?: string | null; body: string; created_at: string }[]) ?? [];
    const lines = [`${first}'s journal — exported ${new Date().toLocaleString("en-GB")}`, ""];
    for (const r of rows) {
      lines.push(`[${fmtStamp(r.created_at)}] ${(r.kind ?? "journal").toUpperCase()}${r.title ? ` — ${r.title}` : ""}`);
      lines.push(r.body, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `journal-${today}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!isParent) {
    return <section><div className="card"><div className="empty">This one&apos;s just for mum &amp; dad.</div></div></section>;
  }

  return (
    <section>
      {/* journey tracker */}
      <div className="card">
        {j ? (
          j.phase === "before-due" ? (
            <>
              <p className="gas-kicker">Journey</p>
              <h2>{j.gaLabel} <span className="muted">· {j.weeksToDue} week{j.weeksToDue === 1 ? "" : "s"} to her due date</span></h2>
              <div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${j.progress * 100}%` }} /></div>
              <p className="muted" style={{ marginTop: 4 }}>
                {Math.floor(family.gestation_days! / 7)}w → 40w · due {fmtDateShort(j.dueDate)}
              </p>
              <p style={{ marginTop: 8 }}>{j.maturing}</p>
              <p className="note" style={{ marginTop: 8 }}>
                <b>{j.daysOld} days of fighting, {j.daysOld} days of winning.</b>
                {j.milestone && <> 🌟 She&apos;s reached {j.milestone} weeks this week — a real milestone, quietly celebrated.</>}
              </p>
            </>
          ) : (
            <>
              <p className="gas-kicker">Journey</p>
              <h2>{j.correctedLabel}</h2>
              <p className="muted">Her due date was {fmtDateShort(j.dueDate)} — she&apos;s past it now, so her age is counted from there.</p>
              <p className="note" style={{ marginTop: 8 }}>
                Milestones and growth are judged from <b>corrected age</b> (RCPCH guidance) — counted from the due date, not the birth date. She is never &ldquo;behind&rdquo;; she&apos;s on her own timeline. {j.daysOld} days of fighting, {j.daysOld} days of winning.
              </p>
            </>
          )
        ) : (
          <>
            <h2>Journey</h2>
            <p className="muted">Add her birth gestation on the Growth card (Updates tab) and this becomes a week-by-week journey tracker toward her due date.</p>
          </>
        )}
      </div>

      {/* today's question */}
      <div className="card">
        <h2>Today&apos;s question for the team</h2>
        <p style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.4 }}>&ldquo;{q.q}&rdquo;</p>
        <p className="muted">Why this matters: {q.why}</p>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => { setQOffset((o) => o + 1); setAnswering(false); }}>Give me another</button>
          <button className="primary" style={{ flex: "0 0 auto" }} onClick={() => setAnswering((a) => !a)}>✓ Asked it — jot the answer</button>
        </div>
        {answering && (
          <div style={{ marginTop: 10 }}>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What the team said…" aria-label="Team's answer" />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={saveAsked}>Save to journal</button>
              <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setAnswering(false)}>Cancel</button>
            </div>
          </div>
        )}
        {saveMsg && <p className="muted" style={{ marginTop: 6 }}>{saveMsg}</p>}
        {asked.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="muted" style={{ cursor: "pointer" }}>Questions you&apos;ve asked ({asked.length})</summary>
            {asked.map((a) => (
              <div key={a.id} className="comment">
                <b>{a.title}</b><br />{a.body}<span className="muted"> · {fmtStamp(a.created_at)}</span>
              </div>
            ))}
          </details>
        )}
      </div>

      {/* something positive */}
      <div className="card" style={{ borderLeft: "4px solid var(--sage)" }}>
        <h2>Something positive today</h2>
        <p style={{ lineHeight: 1.5 }}>{fact.text}</p>
        <p className="muted" style={{ marginTop: 6 }}>
          Source: <a href={fact.url} target="_blank" rel="noreferrer">{fact.source}</a>
        </p>
      </div>

      {/* wellbeing check-in */}
      <div className="card">
        <h2>How are <i>you</i> today?</h2>
        <p style={{ lineHeight: 1.5 }}>{wb}</p>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {(["rough day", "okay", "good day"] as Mood[]).map((m) => (
            <button key={m} className={moodToday === m ? "primary" : "ghost"} style={{ flex: "1 1 30%" }} onClick={() => logMood(m)}>
              {m === "rough day" ? "🌧 Rough day" : m === "okay" ? "🌤 Okay" : "☀️ Good day"}
            </button>
          ))}
        </div>
        {moodToday && <p className="muted" style={{ marginTop: 6 }}>Logged for today — thank you for checking in with yourself.</p>}
      </div>

      {/* vent */}
      <ParentJournal
        kind="vent"
        heading="🗯 Get it off your chest"
        intro="Frustrations with a nurse, a doctor, a decision, the unit — put them here, not in your head at 3am. Private to the two of you. Writing it down often makes the conversation with the team easier the next day."
        placeholder="What happened, who it involved, how it left you feeling…"
        button="Add"
        emptyText="Nothing here — and that's fine too."
        withTitle
        titlePlaceholder="A few words (e.g. 'night nurse — feeding plan')"
      />

      {/* journal */}
      <ParentJournal />

      {/* chat */}
      <div className="card">
        <h2>Ask me anything</h2>
        <p className="muted">
          Answers come only from Bliss and RCPCH — never from guesswork about {first}. Anything about her specifically is one for the team.
          {mode === "offline" && <> <b>Offline mode</b> — fixed answers, not live AI.</>}
        </p>
        <div className="chips">
          {STARTER_CHIPS.map((c) => (
            <button key={c} type="button" className="firstchip" onClick={() => send(c)} disabled={streaming}>{c}</button>
          ))}
        </div>
        {msgs.length > 0 && (
          <div className="chatlog">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content || (streaming && i === msgs.length - 1 ? "…" : "")}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
        <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about breathing support, corrected age, leave & pay…" aria-label="Your question" disabled={streaming} />
          <button className="primary" style={{ flex: "0 0 auto" }} type="submit" disabled={streaming || !input.trim()}>Send</button>
        </form>
        {msgs.length > 0 && (
          <button className="tiny" style={{ marginTop: 6 }} onClick={() => setMsgs([])}>clear conversation</button>
        )}
      </div>

      {/* support directory */}
      <div className="card">
        <h2>Support &amp; reading</h2>
        {SUPPORT_LINKS.map((s) => (
          <p key={s.url} style={{ margin: "8px 0" }}>
            <a href={s.url} target="_blank" rel="noreferrer"><b>{s.label}</b></a>
            <br /><span className="muted">{s.blurb}</span>
          </p>
        ))}
        <button className="ghost" style={{ marginTop: 8 }} onClick={exportJournal}>⬇ Export journal as text</button>
      </div>

      <p className="muted" style={{ fontSize: "0.78rem", padding: "0 6px 12px" }}>{FOOTER}</p>
    </section>
  );
}

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${M[m - 1]} ${y}`;
}
