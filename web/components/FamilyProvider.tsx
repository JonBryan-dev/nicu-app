"use client";
// Family context: profile + family for the signed-in user, one Supabase client,
// and a silent push re-sync on load.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resyncPush } from "@/lib/push";
import type { Family, Profile } from "@/lib/types";

type Ctx = {
  supabase: SupabaseClient;
  profile: Profile;
  family: Family;
  isParent: boolean;
  /** Whether this parent has said they're dad — decides only whether the Lungs
   *  tab is offered. Everything private behind it is enforced by RLS. */
  isDad: boolean;
};

const FamilyCtx = createContext<Ctx | null>(null);

export function FamilyProvider({
  profile,
  family,
  children,
}: {
  profile: Profile;
  family: Family;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      resyncPush(supabase, profile.id).catch(() => {});
    }
  }, [supabase, profile.id]);

  const value = useMemo<Ctx>(
    () => ({
      supabase,
      profile,
      family,
      isParent: profile.role === "parent",
      isDad: profile.role === "parent" && profile.parent_kind === "dad",
    }),
    [supabase, profile, family]
  );

  return <FamilyCtx.Provider value={value}>{children}</FamilyCtx.Provider>;
}

export function useFamily(): Ctx {
  const ctx = useContext(FamilyCtx);
  if (!ctx) throw new Error("useFamily outside FamilyProvider");
  return ctx;
}
