"use client";
// Visits — parents open/delete slots; family books a free slot or cancels
// their own. Grouped by date, upcoming only.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate, fmtTime } from "@/lib/dates";
import type { Profile, VisitSlot } from "@/lib/types";

export default function VisitsTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [slots, setSlots] = useState<VisitSlot[] | null>(null);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekdays" | "weekends">("none");
  const [until, setUntil] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);
  const [bookingFor, setBookingFor] = useState<string | null>(null); // slot id with picker open

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

  // parents can book someone in — load the family list for the picker
  useEffect(() => {
    if (!isParent) return;
    supabase
      .from("profiles")
      .select("id, display_name, role")
      .eq("family_id", family.id)
      .neq("role", "team")
      .order("display_name")
      .then(({ data }) => setMembers((data as Profile[]) ?? []));
  }, [isParent, supabase, family.id]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!date || !from || !to) return;

    // build the list of dates: one, or a repeated run (capped at 31 days)
    const dates: string[] = [];
    if (repeat === "none") {
      dates.push(date);
    } else {
      if (!until) {
        setErr("Pick an end date for the repeat.");
        return;
      }
      if (until < date) {
        setErr("The repeat end date is before the start date.");
        return;
      }
      const d = new Date(date + "T12:00:00");
      const end = new Date(until + "T12:00:00");
      let guard = 0;
      while (d <= end && guard++ < 31) {
        const dow = d.getDay();
        const keep =
          repeat === "daily" ||
          (repeat === "weekdays" && dow >= 1 && dow <= 5) ||
          (repeat === "weekends" && (dow === 0 || dow === 6));
        if (keep) {
          dates.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
          );
        }
        d.setDate(d.getDate() + 1);
      }
      if (!dates.length) {
        setErr("No days match that repeat in the range you picked.");
        return;
      }
    }

    const { error } = await supabase.from("visit_slots").insert(
      dates.map((slot_date) => ({
        family_id: family.id,
        slot_date,
        start_time: from,
        end_time: to,
      }))
    );
    if (error) {
      setErr(
        error.message.includes("end_time")
          ? "The end time needs to be after the start time."
          : error.message
      );
      return;
    }
    setMsg(dates.length > 1 ? `Opened ${dates.length} slots.` : "Slot opened.");
    setDate("");
    setFrom("");
    setTo("");
    setRepeat("none");
    setUntil("");
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

  // parents only: book a chosen family member into a free slot / clear any booking
  async function bookMemberIn(slot: VisitSlot, memberId: string) {
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: memberId })
      .eq("id", slot.id);
    if (error) alert(error.message);
    setBookingFor(null);
    load();
  }

  async function unbook(slot: VisitSlot) {
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: null })
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
          <div className="row wrap" style={{ marginTop: 10 }}>
            <div>
              <label htmlFor="vs-repeat">Repeat</label>
              <select
                id="vs-repeat"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as typeof repeat)}
              >
                <option value="none">Just this day</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekends">Weekends</option>
              </select>
            </div>
            {repeat !== "none" && (
              <div>
                <label htmlFor="vs-until">Until</label>
                <input
                  id="vs-until"
                  type="date"
                  value={until}
                  min={date || todayKey()}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="primary" type="submit">
              {repeat === "none" ? "Open slot" : "Open slots"}
            </button>
          </div>
          {err && <p className="err">{err}</p>}
          {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
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
                  <div key={s.id}>
                    <div className="slot">
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
                      {!s.booked_by &&
                        (isParent ? (
                          <button
                            className="ghost"
                            onClick={() =>
                              setBookingFor(bookingFor === s.id ? null : s.id)
                            }
                          >
                            Book…
                          </button>
                        ) : (
                          <button className="ghost" onClick={() => toggleBooking(s)}>
                            Book
                          </button>
                        ))}
                      {s.booked_by && mine && (
                        <button className="ghost" onClick={() => toggleBooking(s)}>
                          Cancel
                        </button>
                      )}
                      {s.booked_by && !mine && isParent && (
                        <button className="ghost" onClick={() => unbook(s)}>
                          Unbook
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
                    {isParent && bookingFor === s.id && !s.booked_by && (
                      <div className="linkslots">
                        <span className="muted">Who&apos;s coming?</span>
                        {members.map((m) => (
                          <button
                            key={m.id}
                            className="ghost"
                            onClick={() => bookMemberIn(s, m.id)}
                          >
                            {m.id === profile.id ? "Me" : m.display_name}
                          </button>
                        ))}
                        <button className="tiny" onClick={() => setBookingFor(null)}>
                          not now
                        </button>
                      </div>
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
