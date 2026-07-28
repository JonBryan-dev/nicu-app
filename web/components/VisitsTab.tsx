"use client";
// Visits — parents open/delete slots; family books a free slot or cancels
// their own. Grouped by date, upcoming only.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate, fmtTime } from "@/lib/dates";
import type { VisitSlot } from "@/lib/types";

export default function VisitsTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [slots, setSlots] = useState<VisitSlot[] | null>(null);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("visit_slots")
      .select("*, booker:profiles!visit_slots_booked_by_fkey(id, display_name)")
      .eq("family_id", family.id)
      .gte("slot_date", todayKey())
      .order("slot_date")
      .order("start_time");
    setSlots((data as VisitSlot[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "visit_slots", family.id, load);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!date || !from || !to) return;
    const { error } = await supabase.from("visit_slots").insert({
      family_id: family.id,
      slot_date: date,
      start_time: from,
      end_time: to,
    });
    if (error) {
      setErr(
        error.message.includes("end_time")
          ? "The end time needs to be after the start time."
          : error.message
      );
      return;
    }
    setDate("");
    setFrom("");
    setTo("");
    load();
  }

  async function toggleBooking(slot: VisitSlot) {
    const mine = slot.booked_by === profile.id;
    if (slot.booked_by && !mine) return;
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: mine ? null : profile.id })
      .eq("id", slot.id);
    if (error) alert(error.message);
    load();
  }

  async function removeSlot(slot: VisitSlot) {
    await supabase.from("visit_slots").delete().eq("id", slot.id);
    load();
  }

  const grouped: { date: string; slots: VisitSlot[] }[] = [];
  for (const s of slots ?? []) {
    const g = grouped.find((x) => x.date === s.slot_date);
    if (g) g.slots.push(s);
    else grouped.push({ date: s.slot_date, slots: [s] });
  }

  return (
    <section>
      {isParent && (
        <form className="card" onSubmit={addSlot}>
          <h2>Open a visiting slot</h2>
          <p className="note">
            Only slots you open here can be booked — visits only happen when
            they suit you.
          </p>
          <div className="row wrap">
            <div>
              <label htmlFor="vs-date">Date</label>
              <input
                id="vs-date"
                type="date"
                value={date}
                min={todayKey()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="vs-from">From</label>
              <input
                id="vs-from"
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="vs-to">To</label>
              <input
                id="vs-to"
                type="time"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="primary" type="submit">
              Open slot
            </button>
          </div>
          {err && <p className="err">{err}</p>}
        </form>
      )}

      <div className="card">
        <h2>Visiting slots</h2>
        {!isParent && (
          <p className="note">
            Pick a free slot and it&apos;s yours — one household per slot.
          </p>
        )}
        {slots === null ? null : slots.length === 0 ? (
          <div className="empty">No slots open yet — check back soon.</div>
        ) : (
          grouped.map((g) => (
            <div key={g.date}>
              <div className="datehead">{fmtDate(g.date)}</div>
              {g.slots.map((s) => {
                const mine = s.booked_by === profile.id;
                return (
                  <div key={s.id} className="slot">
                    <div style={{ flex: 1 }}>
                      <span className="t">
                        {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                      </span>{" "}
                      {s.booked_by ? (
                        <span className="badge booked">
                          {mine ? "You" : s.booker?.display_name ?? "Booked"}
                        </span>
                      ) : (
                        <span className="badge">Free</span>
                      )}
                    </div>
                    {(!s.booked_by || mine) && (
                      <button className="ghost" onClick={() => toggleBooking(s)}>
                        {mine ? "Cancel" : "Book"}
                      </button>
                    )}
                    {isParent && (
                      <button
                        className="tiny"
                        onClick={() => removeSlot(s)}
                        aria-label="Delete slot"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
