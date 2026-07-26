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

  const { data: family } = await supabase
    .from("families")
    .select("*")
    .eq("id", profile.family_id)
    .single<Family>();
  if (!family) redirect("/onboarding");

  return (
    <FamilyProvider profile={profile} family={family}>
      <Shell>{children}</Shell>
    </FamilyProvider>
  );
}
