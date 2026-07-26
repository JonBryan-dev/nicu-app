# NICU Companion — build instructions for Claude Code

Read PRD.md fully before writing any code. Everything you need is in this folder.

## What this is
A private family app for a NICU stay (~3 months). Two parents live at the hospital;
family members help via claimed jobs and booked visiting slots. Built as
Next.js 14 (App Router) + Supabase (auth, Postgres, Realtime, Edge Functions) + Web Push.
Deployed on Vercel.

## Ground rules
1. `reference-design.html` is the visual source of truth. Extract its CSS variables,
   fonts (Fraunces + Nunito Sans), spacing, and component styles. The production app
   should look like that file, not like a default shadcn app.
2. Run migrations in `supabase/migrations/` in numeric order. Do not restructure the
   schema — RLS and triggers depend on it. Extend with new migrations only.
3. Mobile-first. Parents use this on phones in a hospital room. Max content width 560px.
4. All data access through Supabase client with RLS. Never use the service-role key
   in the browser. Service-role key is used ONLY by the notify edge function.
5. Realtime subscriptions on: updates, support_tasks, visit_slots, checklist_items,
   shift_blocks — the two parents' phones must stay in sync without refresh.
6. Keep dependencies minimal: @supabase/supabase-js, @supabase/ssr, date-fns, web-push (edge only).
   No component library.

## Build order
1. Supabase project setup + run migrations + deploy notify function + set DB webhook
   (instructions in PRD.md §9).
2. Auth (magic link) + onboarding (create family / join by invite code).
3. Tabs in this order: Updates → Lists → Support → Visits → Rest.
4. Web push (sw.js + subscribe flow in web/lib/push.ts) + notification outbox wiring.
5. Polish pass against reference-design.html, then Vercel deploy.

## Testing checklist (do these before calling it done)
- Two browsers: parent + family member. Family member joins via invite code.
- Family claims a support task → parent receives push within seconds.
- Parent posts a milestone update → family receives push.
- Family books a visit slot → parent push; slot shows "booked" to a third user.
- Daily checklist regenerates fresh the next day (fake by calling ensure_period_items
  with tomorrow's key); custom items persist for their day only.
- Family member CANNOT: post updates, edit checklists, open slots, see push
  subscriptions of others. Verify by attempting via the client console.
- RLS: a user from a different family sees nothing (create a second family to test).
