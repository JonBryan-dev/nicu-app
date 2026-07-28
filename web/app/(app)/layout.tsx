// Authenticated app shell — gates on session + profile, loads family, renders hero/tabs.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FamilyProvider } from "@/components/FamilyProvider";
import Shell from "@/components/Shell";
import type { Family, Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) redirect("/onboarding");

  let family: Family | null = null;
  if (profile.role === "team") {
    // team can't read the families row (it holds invite codes) — summary RPC
    const { data } = await supabase.rpc("my_family_summary");
    family = data as Family | null;
  } else {
    const { data } = await supabase
      .from("families")
      .select("*")
      .eq("id", profile.family_id)
      .single<Family>();
    family = data;
  }
  if (!family) redirect("/onboarding");

  return (
    <FamilyProvider profile={profile} family={family}>
      <Shell>{children}</Shell>
    </FamilyProvider>
  );
}
