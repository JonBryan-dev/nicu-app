"use client";
// PushPrompt — friendly one-time card offering to turn on notifications.
// Hidden if push is unsupported, unconfigured, already granted, or dismissed.
import { useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { enablePush } from "@/lib/push";

const DISMISS_KEY = "push-prompt-dismissed";

export default function PushPrompt() {
  const { supabase, profile } = useFamily();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setShow(true);
  }, []);

  if (!show) return null;

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush(supabase, profile.id);
    } catch {
      // denied or unsupported
    }
    setBusy(false);
    setShow(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <div className="card">
      <h2>Stay in the loop</h2>
      <p className="note">
        Turn on notifications to hear about new updates, claimed jobs and visit
        bookings the moment they happen — even with the app closed.
      </p>
      <div className="row">
        <button className="primary" onClick={turnOn} disabled={busy}>
          {busy ? "One sec…" : "Turn on notifications"}
        </button>
        <button className="ghost" onClick={dismiss} style={{ flex: "0 0 auto" }}>
          Not now
        </button>
      </div>
    </div>
  );
}
