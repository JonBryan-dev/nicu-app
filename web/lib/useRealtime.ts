"use client";
// useRealtime — subscribe to postgres_changes on a table for this family and
// call onChange on every event. Used to keep both parents' phones in sync.
import { useEffect, useId, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export function useRealtime(
  supabase: SupabaseClient,
  table: string,
  familyId: string,
  onChange: () => void
) {
  const cb = useRef(onChange);
  cb.current = onChange;
  // unique per hook instance — two components subscribing to the same table
  // must not share a channel name (Supabase reuses it and the 2nd .on() throws)
  const instanceId = useId();

  useEffect(() => {
    const channel = supabase
      .channel(`rt-${table}-${familyId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `family_id=eq.${familyId}`,
        },
        () => cb.current()
      )
      .subscribe();

    // iOS suspends the websocket while the app is backgrounded — refetch on
    // resume so reopened screens never show a stale picture
    const onWake = () => {
      if (document.visibilityState === "visible") cb.current();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [supabase, table, familyId, instanceId]);
}
