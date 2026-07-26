// lib/ensureItems.ts — materialise a period's checklist items from templates.
//
// Primary path is the ensure_period_items RPC (PRD §4). The currently deployed
// version of that function fails with 42P10 (its ON CONFLICT clause cannot
// match the partial unique index) — fixed in migrations/005. Until that
// migration is applied, parents fall back to inserting the missing template
// rows directly; the partial unique index still blocks duplicate races and a
// benign 23505 from a simultaneous parent is ignored.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListType } from "@/lib/types";

export async function ensurePeriodItems(
  supabase: SupabaseClient,
  familyId: string,
  isParent: boolean,
  listType: ListType,
  scopeKey: string
) {
  const { error } = await supabase.rpc("ensure_period_items", {
    p_list_type: listType,
    p_scope_key: scopeKey,
  });
  if (!error || !isParent) return;

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("id, item_text, sort_order")
    .eq("family_id", familyId)
    .eq("list_type", listType);
  if (!templates?.length) return;

  const { data: existing } = await supabase
    .from("checklist_items")
    .select("template_id")
    .eq("family_id", familyId)
    .eq("list_type", listType)
    .eq("scope_key", scopeKey)
    .not("template_id", "is", null);
  const have = new Set((existing ?? []).map((r) => r.template_id));

  const missing = templates
    .filter((t) => !have.has(t.id))
    .map((t) => ({
      family_id: familyId,
      list_type: listType,
      scope_key: scopeKey,
      template_id: t.id,
      item_text: t.item_text,
      sort_order: t.sort_order,
    }));
  if (missing.length) {
    await supabase.from("checklist_items").insert(missing); // 23505 race is fine
  }
}
