"use client";
// useRealtime — subscribe to postgres_changes on a table for this family and
// call onChange on every event. Used to keep both parents' phones in sync.
import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export function useRealtime(
  supabase: SupabaseClient,
  table: string,
  familyId: string,
  onChange: () => void
) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const channel = supabase
      .channel(`rt-${table}-${familyId}`)
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, table, familyId]);
}
