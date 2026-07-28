"use client";
// Feeds — mum & dad's private feeding hub: live feed timer, the day's grid
// (re-anchored by each actual feed), protected sleep windows, supply vs
// demand, and the calendar subscription link.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey } from "@/lib/dates";
import {
  computeSchedule,
  fmtHM,
  DEFAULT_SETTINGS,
  type FeedSettingsRow,
  type SleepWindowRow,
  type FeedRow,
  type SlotRow,
} from "@/lib/feedSchedule";

type FeedRecord = FeedRow & { id: string; method: string };

export default function FeedsTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [settings, setSettings] = useState<FeedSettingsRow>(DEFAULT_SETTINGS);
  const [windows, setWindows] = useState<SleepWindowRow[]>([]);
  const [feeds, setFeeds] = useState<FeedRecord[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [expressedToday, setExpressedToday] = useState(0);
  const [exprMl, setExprMl] = useState("");
  const [finishMl, setFinishMl] = useState("");
  const [finishMethod, setFinishMethod] = useState("bottle");
  const [tick, setTick] = useState(0);
  const [showPlan, setShowPlan] = useState(false);
  const [err, setErr] = useState("");

  const dayKey = todayKey();

  const load = useCallback(async () => {
    if (!isParent) return;
    const dayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const [st, sw, fd, sl, ex] = await Promise.all([
      supabase.from("feed_settings").select("*").eq("family_id", family.id).maybeSingle(),
      supabase.from("sleep_windows").select("*").eq("family_id", family.id),
      supabase.from("feeds").select("*").eq("family_id", family.id).gte("started_at", dayStartIso).order("started_at"),
      supabase
        .from("visit_slots")
        .select("slot_date, start_time, end_time, booker:profiles!visit_slots_booked_by_fkey(display_name)")
        .eq("family_id", family.id)
        .eq("slot_date", dayKey),
      supabase.from("expressing_logs").select("ml").eq("family_id", family.id).gte("at", dayStartIso),
    ]);
    if (st.data) setSettings(st.data as FeedSettingsRow);
    setWindows((sw.data as SleepWindowRow[]) ?? []);
    setFeeds((fd.data as FeedRecord[]) ?? []);
    setSlots(
      ((sl.data as unknown as { slot_date: string; start_time: string; end_time: string; booker: { display_name: string } | null }[]) ?? []).map(
        (s) => ({ slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time, booker: s.booker?.display_name ?? null })
      )
    );
    setExpressedToday(((ex.data as { ml: number }[]) ?? []).reduce((a, r) => a + r.ml, 0));
  }, [supabase, family.id, isParent, dayKey]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", family.id, load);
  useRealtime(supabase, "expressing_logs", family.id, load);
  useRealtime(supabase, "visit_slots", family.id, load);

  // live timer tick
  const openFeed = feeds.find((f) => !f.ended_at);
  useEffect(() => {
    if (!openFeed) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [openFeed]);

  const schedule = useMemo(
    () => computeSchedule(settings, feeds.filter((f) => f.ended_at || f.started_at), windows, slots),
    [settings, feeds, windows, slots]
  );

  const consumedToday = feeds.reduce((a, f) => a + (f.ml ?? 0), 0);

  if (!isParent) {
    return (
      <section>
        <div className="card">
          <div className="empty">This one&apos;s just for mum &amp; dad.</div>
        </div>
      </section>
    );
  }

  async function startFeed() {
    setErr("");
    const { error } = await supabase.from("feeds").insert({
      family_id: family.id,
      fed_by: profile.id,
      started_at: new Date().toISOString(),
    });
    if (error) setErr(error.message);
    load();
  }

  async function finishFeed() {
    if (!openFeed) return;
    setErr("");
    const ml = finishMl ? parseInt(finishMl, 10) : null;
    if (ml !== null && (isNaN(ml) || ml < 0 || ml > 500)) {
      setErr("Millilitres should be a number like 40.");
      return;
    }
    const { error } = await supabase
      .from("feeds")
      .update({ ended_at: new Date().toISOString(), ml, method: finishMethod })
      .eq("id", openFeed.id);
    if (error) setErr(error.message);
    setFinishMl("");
    load();
  }

  async function logExpressing(e: React.FormEvent) {
    e.preventDefault();
    const ml = parseInt(exprMl, 10);
    if (isNaN(ml) || ml <= 0) return;
    await supabase.from("expressing_logs").insert({ family_id: family.id, logged_by: profile.id, ml });
    setExprMl("");
    load();
  }

  async function saveSettings(next: Partial<FeedSettingsRow>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    await supabase.from("feed_settings").upsert({ family_id: family.id, ...merged, updated_at: new Date().toISOString() });
  }

  async function saveWindow(person: "mum" | "dad", start_time: string, end_time: string) {
    if (!start_time || !end_time) return;
    await supabase.from("sleep_windows").upsert({ family_id: family.id, person, start_time, end_time });
    load();
  }

  const elapsed = openFeed ? Math.floor((Date.now() - +new Date(openFeed.started_at)) / 1000) : 0;
  void tick;

  const calUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/${family.calendar_token}`;

  return (
    <section>
      {/* timer */}
      <div className="card">
        <h2>Feed timer</h2>
        {openFeed ? (
          <>
            <div className="timer">
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
              <span className="muted"> since {fmtHM(new Date(openFeed.started_at))}</span>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div>
                <label htmlFor="fin-ml">Amount (ml)</label>
                <input id="fin-ml" type="text" inputMode="numeric" value={finishMl} onChange={(e) => setFinishMl(e.target.value)} placeholder={settings.target_ml ? String(settings.target_ml) : "40"} />
              </div>
              <div>
                <label htmlFor="fin-method">How</label>
                <select id="fin-method" value={finishMethod} onChange={(e) => setFinishMethod(e.target.value)}>
                  <option value="breast">Breast</option>
                  <option value="bottle">Bottle</option>
                  <option value="ngt">NG tube</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="primary" onClick={finishFeed}>Finish feed</button>
            </div>
          </>
        ) : (
          <>
            <p className="note">Starting the timer logs the feed and re-plans the rest of today.</p>
            <button className="primary" onClick={startFeed}>Start feed now</button>
          </>
        )}
        {err && <p className="err">{err}</p>}
      </div>

      {/* today's grid */}
      <div className="card">
        <h2>Today&apos;s feeds</h2>
        {schedule.length === 0 ? (
          <div className="empty">Start the first feed and today&apos;s plan appears here.</div>
        ) : (
          schedule.map((s, i) => (
            <div key={i} className={`feedrow ${s.logged ? "done" : ""}`}>
              <span className="t">{s.logged ? "✓" : "·"} {fmtHM(s.at)}</span>
              <span className="info">
                {s.logged
                  ? s.ml != null ? `${s.ml} ml` : "logged"
                  : [
                      s.assigned ? `${s.assigned}'s (protected sleep)` : null,
                      s.duringVisit ? (s.duringVisit === "free slot" ? "during an open slot" : `during ${s.duringVisit}'s visit`) : null,
                    ].filter(Boolean).join(" · ") || "planned"}
              </span>
            </div>
          ))
        )}
      </div>

      {/* supply vs demand */}
      <div className="card">
        <h2>Supply &amp; demand today</h2>
        <div className="supply">
          <div>
            <div className="big">{consumedToday} ml</div>
            <div className="muted">taken by baby</div>
          </div>
          <div>
            <div className="big">{expressedToday} ml</div>
            <div className="muted">expressed</div>
          </div>
          <div>
            <div className="big" style={{ color: expressedToday - consumedToday >= 0 ? "var(--sage)" : "var(--rose-deep)" }}>
              {expressedToday - consumedToday >= 0 ? "+" : ""}{expressedToday - consumedToday} ml
            </div>
            <div className="muted">difference</div>
          </div>
        </div>
        <form className="row" style={{ marginTop: 10 }} onSubmit={logExpressing}>
          <input type="text" inputMode="numeric" value={exprMl} onChange={(e) => setExprMl(e.target.value)} placeholder="Log expressing (ml)…" aria-label="Expressed millilitres" />
          <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">Add</button>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>
          Trends here are a guide — changes to feeding or expressing are a chat with your unit.
        </p>
      </div>

      {/* plan & sleep settings */}
      <div className="card">
        <h2>Plan &amp; protected sleep</h2>
        {!showPlan ? (
          <button className="ghost" onClick={() => setShowPlan(true)}>Edit the plan</button>
        ) : (
          <>
            <div className="row">
              <div>
                <label>Daytime feeds every</label>
                <select value={settings.interval_day_min} onChange={(e) => saveSettings({ interval_day_min: +e.target.value })}>
                  <option value={120}>2 hours</option>
                  <option value={150}>2½ hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                </select>
              </div>
              <div>
                <label>Overnight every</label>
                <select value={settings.interval_night_min ?? 0} onChange={(e) => saveSettings({ interval_night_min: +e.target.value || null })}>
                  <option value={0}>Same as day</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label>Day starts</label>
                <input type="time" value={settings.day_from.slice(0, 5)} onChange={(e) => saveSettings({ day_from: e.target.value })} />
              </div>
              <div>
                <label>Night starts</label>
                <input type="time" value={settings.night_from.slice(0, 5)} onChange={(e) => saveSettings({ night_from: e.target.value })} />
              </div>
              <div>
                <label>Target ml/feed</label>
                <input type="text" inputMode="numeric" defaultValue={settings.target_ml ?? ""} onBlur={(e) => saveSettings({ target_ml: e.target.value ? +e.target.value : null })} placeholder="40" />
              </div>
            </div>
            <SleepEditor label="Mum's protected sleep" current={windows.find((w) => w.person === "mum")} onSave={(s, e) => saveWindow("mum", s, e)} />
            <SleepEditor label="Dad's protected sleep" current={windows.find((w) => w.person === "dad")} onSave={(s, e) => saveWindow("dad", s, e)} />
            <button className="tiny" style={{ marginTop: 8 }} onClick={() => setShowPlan(false)}>Done</button>
          </>
        )}
      </div>

      {/* calendar */}
      <div className="card">
        <h2>Shared calendar</h2>
        <p className="note">
          Subscribe once in Google or Apple Calendar and today&apos;s feeds, sleep windows and visits stay up to date for everyone.
        </p>
        <input type="text" readOnly value={calUrl} onFocus={(e) => e.target.select()} aria-label="Calendar subscription link" />
        <button
          className="ghost"
          style={{ marginTop: 8 }}
          onClick={() => navigator.clipboard?.writeText(calUrl)}
        >
          Copy link
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          Google: Other calendars → From URL. iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar.
        </p>
      </div>
    </section>
  );
}

function SleepEditor({
  label,
  current,
  onSave,
}: {
  label: string;
  current?: SleepWindowRow;
  onSave: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(current?.start_time?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(current?.end_time?.slice(0, 5) ?? "");
  useEffect(() => {
    if (current) {
      setStart(current.start_time.slice(0, 5));
      setEnd(current.end_time.slice(0, 5));
    }
  }, [current]);
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <div>
        <label>{label}</label>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div>
        <label>until</label>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <button type="button" className="ghost" style={{ flex: "0 0 auto" }} onClick={() => onSave(start, end)}>
        Save
      </button>
    </div>
  );
}
