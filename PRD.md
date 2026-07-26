# NICU Companion — PRD v1.0

Private family coordination app for a long NICU stay. One family per deployment for now,
but the schema is multi-tenant (family_id everywhere) so it can scale later.

## 1. Users & roles
| Role | Who | Can do |
|---|---|---|
| parent | Mum & Dad (max ~2-3) | Everything: post updates, manage all lists, open/remove visit slots, edit shift pattern, nudge tasks, manage invite codes |
| family | Grandparents, siblings, friends | Read updates & shift pattern; claim/unclaim support tasks; book/cancel their own visit slot |

Auth: Supabase magic-link email. No passwords.
Onboarding:
- First parent: "Create your space" → baby name + DOB + own display name → `create_family` RPC.
  Shows two invite codes: parent code + family code.
- Everyone else: "Join with a code" → code + display name → `join_family` RPC. Role is
  derived from which code they used — never user-selectable.

## 2. Screens (5 tabs + hero)
Persistent hero at top: baby's name, big "Day N" counter (days since DOB, day 1 = birth day),
"born {date}" line. Fraunces serif, dusty-rose accent. See reference-design.html.

### 2.1 Updates
- Feed of posts, newest first, on a dotted vertical "thread" with dot markers.
  Milestone posts get a filled dot + "✦ Milestone" pill.
- Composer (parents only): textarea + milestone checkbox + Post.
- Post: author name, timestamp (en-GB), body (pre-wrap). Parents can delete any post.
- Push on new post → all family-role members: "{author} posted an update about {baby}".
  Milestones use title "✦ A milestone for {baby}!".

### 2.2 Lists (parents' own)
- "Today" card: daily checklist, progress bar, add custom item, delete item, checkbox toggle.
  Regenerates from daily templates each calendar day (Europe/London). Custom items belong
  to their day only.
- "This week" card: same behaviour keyed by ISO week.
- Family role: hidden tab? No — visible read-only (grandparents like seeing it), no controls.

### 2.3 Support
- List of jobs. Each row: text; if claimed → "✓ {name} has this covered".
- Family: "I'll do this" / "Un-claim" (only their own claim).
- Parents: add job, delete job, and **Nudge** on unclaimed jobs.
  Nudge does two things: (a) inserts a notification to family role ("Can anyone cover:
  {job}?"), (b) offers a WhatsApp share link with prefilled text as fallback.
- Push on claim → parent role: "{name} will handle: {job}".
- Push on new job → family role: "New job needs cover: {job}".

### 2.4 Visits
- Parents card "Open a visiting slot": date + from + to → creates slot. Delete slot.
- Slot list grouped by date (upcoming only), each slot: time range + Free/booked badge.
- Family: Book a free slot (one household per slot), Cancel their own booking.
- Push on new slot → family: "New visiting slot: {date} {from}–{to}".
- Push on booking → parents: "{name} booked {date} {from}–{to}".
- Push on cancellation → parents: "{name} cancelled {date} {from}–{to}".

### 2.5 Rest
- **Shift pattern**: 7 columns (Mon–Sun) × 3 rows (AM/PM/Eve). Each cell one of:
  both / mum / dad / family / rest, colour-coded chips (see reference CSS). Parents tap
  to cycle; family read-only. Keyed by ISO week; new week starts all-"both".
- **Wellbeing today**: two lists (Mum / Dad) from wellbeing templates, daily reset,
  combined progress bar. Parents only can tick.
- **Respite this week**: list from respite templates, weekly reset, progress bar,
  helper text "Aim to tick at least three."

## 3. Data model (see migrations for authority)
families, profiles, updates, checklist_templates, checklist_items, support_tasks,
visit_slots, shift_blocks, push_subscriptions, notifications (outbox).
- checklist list_type ∈ daily | weekly | wellbeing_mum | wellbeing_dad | respite
- scope_key: 'YYYY-MM-DD' for daily/wellbeing, 'IYYY-Www' (ISO) for weekly/respite.
- Default templates are seeded per family by trigger on family creation
  (004_seed_templates.sql holds the copy — keep wording exactly).

## 4. Period item generation
Client calls `ensure_period_items(family, list_type, scope_key)` RPC on tab load; it
inserts missing rows from templates (idempotent, `on conflict do nothing`). No cron needed.

## 5. Notifications
Outbox pattern: business logic inserts into `notifications` (family_id, recipient_role,
title, body, url). A Supabase Database Webhook on INSERT calls the `notify` edge function,
which loads push_subscriptions for profiles of that family+role and sends Web Push
(VAPID). Failed/410 endpoints are deleted. The sender is excluded (actor_id column).
Client: sw.js shows the notification and focuses/opens `url` on click. Subscribe prompt
appears after onboarding with a friendly explainer; resubscribe silently on load if
permission already granted.

## 6. Design tokens (extract from reference-design.html)
Palette: linen #FAF7F2, ink #2E2A33, ink-soft #6E6672, rose #C98A8E, rose-deep #A96065,
sage #7E9C7E, sky #7E93A8, mist #EDE7DE, card #FFFFFF. Radius 16px cards / 12px controls /
999px pills. Fonts: Fraunces (display), Nunito Sans (UI). Sticky pill tab bar. Progress
bars sage. The dotted thread on Updates is the signature element — keep it.

## 7. Non-functional
- Timezone: Europe/London for all day/week keys (compute server-side in the RPC).
- Realtime on all shared tables so both parents' phones stay in sync.
- Empty states use the exact copy from reference-design.html.
- Accessibility: visible focus rings, aria-labels on icon-only buttons, checkboxes ≥20px.
- No analytics, no tracking. This is a private family space.

## 8. Out of scope v1
Photos in updates (v1.1 — Supabase Storage), comments/reactions, multiple babies,
SMS/WhatsApp API sending (share-link fallback only), iOS install banner polish.

## 9. Environment / deploy
1. Create Supabase project → run migrations 001→004.
2. `supabase functions deploy notify` with secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:).
3. Database Webhook: table `notifications`, event INSERT → notify function URL.
4. Vercel env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   NEXT_PUBLIC_VAPID_PUBLIC_KEY. Generate VAPID pair with `npx web-push generate-vapid-keys`.
5. Supabase Auth: enable email magic link; set site URL to the Vercel domain.
