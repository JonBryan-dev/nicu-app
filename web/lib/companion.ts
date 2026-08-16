// lib/companion.ts — "Our NICU Companion": the curated knowledge base (the
// ONLY permitted source of factual claims — compiled from Bliss and RCPCH),
// the daily rotations, the journey-tracker date maths, the strict chat system
// prompt, and an offline keyword answerer. Pure module, no I/O.
//
// This is a support and information companion, not a medical tool. Nothing
// here gives medical advice or speculates about a specific baby; anything
// baby-specific goes to "your neonatal team".

export type Src = "Bliss" | "RCPCH";
export interface Fact { text: string; source: Src; url: string; topic: string }

export const FACTS: Fact[] = [
  { topic: "you are not alone", source: "Bliss", url: "https://www.bliss.org.uk/research-campaigns/neonatal-care-statistics", text: "Over 90,000 babies are cared for in UK neonatal units every year — around 1 in 7 of all babies born." },
  { topic: "you are not alone", source: "Bliss", url: "https://www.bliss.org.uk/research-campaigns/neonatal-care-statistics/prematurity-statistics-in-the-uk", text: "Nearly 58,000 babies are born prematurely in the UK every year — about 1 in 13." },
  { topic: "you are not alone", source: "Bliss", url: "https://www.bliss.org.uk/research-campaigns/neonatal-care-statistics", text: "Of every 1,000 babies needing neonatal care: 25 are extremely preterm (born before 28 weeks), 51 very preterm (28–32w), 283 moderately preterm (32–37w). Babies born before 28 weeks are a group every NICU knows well, with established pathways and specialist teams." },
  { topic: "survival and outcomes", source: "Bliss", url: "https://www.bliss.org.uk/research-campaigns/neonatal-care-statistics", text: "The clear majority of babies born at 26 weeks in the UK who reach neonatal care survive and go home, and most grow up without serious disability. Outcomes at this gestation have never been better. Averages are only averages — the neonatal team can say what things look like for THIS baby, and that answer matters far more." },
  { topic: "how care is monitored", source: "RCPCH", url: "https://www.rcpch.ac.uk/work-we-do/quality-improvement-patient-safety/national-neonatal-audit-programme", text: "Since 2006 the National Neonatal Audit Programme (NNAP) has audited every neonatal unit in England, Scotland, Wales and the Isle of Man — yearly, with published data — on outcomes of care, optimal perinatal care, maternal breastmilk feeding, parental partnership, and neonatal nurse staffing. The baby is in one of the most audited, evidence-driven neonatal systems in the world, and the unit is measured on how well it involves PARENTS." },
  { topic: "brain protection", source: "RCPCH", url: "https://qicentral.rcpch.ac.uk/resources/systems-of-care/prevention-of-cerebral-palsy-in-preterm-labour-precept/", text: "PReCePT: an NHS-wide programme giving magnesium sulphate in preterm labour to protect premature babies' brains and reduce cerebral palsy risk." },
  { topic: "steroids", source: "RCPCH", url: "https://qicentral.rcpch.ac.uk/resources/spotlight-projects/optimal-timing-antenatal-corticosteroids-preterm/", text: "Optimal timing of antenatal corticosteroids: an RCPCH-highlighted QI project improving outcomes in preterm birth." },
  { topic: "eye screening", source: "RCPCH", url: "https://www.rcpch.ac.uk/resources/screening-retinopathy-prematurity-rop-clinical-guideline", text: "ROP eye screening: a national RCPCH clinical guideline ensures every very premature baby gets routine retinopathy-of-prematurity screening on schedule; because screening is systematic, ROP is caught early, when it is very treatable." },
  { topic: "growth and corrected age", source: "RCPCH", url: "https://www.rcpch.ac.uk/sites/default/files/Plotting_preterm_infants.pdf", text: "Preterm growth charts: premature babies are plotted on dedicated RCPCH preterm growth charts and assessed at corrected age (counted from the due date, not the birth date). \"Small for a newborn\" is not the measure — \"tracking their own curve\" is." },
  { topic: "breathing support", source: "Bliss", url: "https://www.bliss.org.uk/parents/in-hospital/about-neonatal-care/equipment-on-the-unit", text: "Breathing support works like a ladder: ventilator (including high-frequency oscillating ventilators), BiPAP, CPAP, high-flow, then oxygen alone. CPAP slightly raises air pressure to keep the lungs inflated; used early it reduces the risk of needing mechanical ventilation. Surfactant therapy is usually needed for a short time in the first two to three days." },
  { topic: "breathing support", source: "Bliss", url: "https://www.bliss.org.uk/parents/about-your-baby/medical-conditions/respiratory-conditions/respiratory-distress-syndrome-rds", text: "Teams deliberately step babies up AND down this ladder as their lungs need, sometimes several times. Premature lungs are among the last things to mature; a step back onto the ventilator is the team matching support to what the lungs can manage that day — very common at this gestation and not automatically a setback. What matters is the trend over weeks, not any single day. The right question for the team: \"Over the past couple of weeks, is the breathing support heading in the right direction, and is this back-and-forth what you'd expect for my baby?\"" },
  { topic: "feeding", source: "Bliss", url: "https://www.bliss.org.uk/parents/support", text: "Breastmilk is one of the most powerful things a parent can give a premature baby; even tiny amounts matter. Support for maternal breastmilk feeding is a formal NNAP audit measure — every UK unit is measured on it. Units have staff whose job is to help with expressing." },
  { topic: "money and leave", source: "Bliss", url: "https://www.bliss.org.uk/parents/support/financial-information-and-support-for-families/parental-leave-and-pay", text: "The UK now has statutory Neonatal Care Leave and Pay — extra paid leave for parents whose baby is in neonatal care, on top of normal parental leave. Bliss has financial guidance covering travel costs, hospital parking, extra childcare and missed work." },
  { topic: "parent support", source: "Bliss", url: "https://www.bliss.org.uk/parents/support", text: "Bliss offers a video call support service, mental-health resources written for NICU parents, and support organised by journey stage (in hospital, going home, growing up), including resources for LGBTQIA+ families and those facing uncertainty or loss." },
  { topic: "stories", source: "Bliss", url: "https://www.bliss.org.uk/story/geoffs-story", text: "The Bliss stories archive includes adults born very premature decades ago — with far less advanced care than today — now living full lives (Geoff's story), parents describing life on CPAP (Jo's story: https://www.bliss.org.uk/story/jos-story-05-18), and parents who found their first relief just reading that others had walked the same road (Heather's story: https://www.bliss.org.uk/story/peoples-stories-on-bliss-website-felt-relief)." },
];

// "Something positive today" rotates through the reassuring subset
export const POSITIVE_FACTS: Fact[] = FACTS.filter((f) =>
  ["you are not alone", "survival and outcomes", "how care is monitored", "eye screening", "growth and corrected age", "feeding", "money and leave", "parent support", "stories", "brain protection"].includes(f.topic)
);

export interface TeamQuestion { q: string; why: string }
export const QUESTIONS: TeamQuestion[] = [
  { q: "How is my baby's breathing support trending — are we moving in the right direction this week?", why: "Trends matter more than any single day in the NICU." },
  { q: "When is my baby's next eye (ROP) screening due, and what did the last one show?", why: "Routine ROP screening follows a national RCPCH guideline; staying on schedule is what makes it effective." },
  { q: "Can I do skin-to-skin (kangaroo care) today — and if not yet, what needs to happen first?", why: "Parental involvement is one of the things every UK unit is audited on." },
  { q: "Can you show me my baby's growth chart and how they're tracking on their own curve?", why: "Preterm babies get their own RCPCH growth charts." },
  { q: "How can I help more with feeding — is expressed milk on track, and who can support us with it?", why: "Breastmilk feeding support is a formal NNAP audit measure." },
  { q: "Which 'cares' can I take over today — nappy, temperature, comfort holding, mouth care?", why: "Everyday cares build confidence, and your baby knows your touch and voice." },
  { q: "What's the plan for the next 48 hours, and what would 'a good week' look like from here?", why: "Having the short-term plan in your own words makes the days less foggy." },
  { q: "Have we started the paperwork for Neonatal Care Leave and Pay — and is there help with parking and travel?", why: "Statutory neonatal leave exists for exactly this." },
  { q: "What made you smile about my baby today?", why: "The nurses see personality long before the monitors quiet down." },
  { q: "What follow-up will my baby have after discharge, and how does corrected age work for milestones?", why: "Development is judged from the due date, not the birth date." },
  { q: "Is there anything about my baby's care I could learn to do before we go home?", why: "Every skill learned now is confidence banked for home." },
  { q: "How is my baby sleeping and settling — and what comforts them most when I'm not here?", why: "Small details keep you close between visits." },
  { q: "Who can I talk to on the unit about how I'M coping?", why: "Supporting parents is part of neonatal care, not an extra." },
  { q: "What number can I ring overnight — and is it always okay to call?", why: "Every parent worries at 3am. It is always okay to call." },
];

export const WELLBEING: string[] = [
  "Have you eaten a proper meal today — not just hospital-café toast?",
  "When did you last get ten minutes of daylight? The NICU will call if anything changes. It's allowed.",
  "Have you told anyone honestly how you're doing this week? Bliss's video call support service exists for exactly that.",
  "Are you and your partner (or your people) checking in on each other, not just on the baby?",
  "Have you written down one small win from today? On hard days, the list is proof of how far you've come.",
  "Nothing works without sleep. Is there one thing you could hand off tonight?",
  "Guilt is almost universal among NICU parents — and almost never deserved. Being there IS parenting.",
  "If today was heavy, that's not weakness. You're allowed to find this hard.",
];

export const SUPPORT_LINKS: { label: string; url: string; blurb: string }[] = [
  { label: "Bliss parent support hub", url: "https://www.bliss.org.uk/parents/support", blurb: "Video call support, mental-health resources and help by journey stage." },
  { label: "Neonatal Care Leave & Pay", url: "https://www.bliss.org.uk/parents/support/financial-information-and-support-for-families/parental-leave-and-pay", blurb: "The statutory extra leave and pay, plus guidance on travel, parking and childcare costs." },
  { label: "Understanding the equipment", url: "https://www.bliss.org.uk/parents/in-hospital/about-neonatal-care/equipment-on-the-unit", blurb: "Ventilators, CPAP, high-flow — what each one does." },
  { label: "Words you might hear on the neonatal unit", url: "https://www.bliss.org.uk/parents/in-hospital/about-neonatal-care/words-you-might-hear-on-the-neonatal-unit", blurb: "A plain-English glossary of the unit's language." },
  { label: "Jo's story (CPAP)", url: "https://www.bliss.org.uk/story/jos-story-05-18", blurb: "A parent describing life on CPAP." },
  { label: "Parents' stories", url: "https://www.bliss.org.uk/parents/support/your-stories", blurb: "Others who've walked the same road." },
  { label: "RCPCH National Neonatal Audit Programme", url: "https://www.rcpch.ac.uk/work-we-do/quality-improvement-patient-safety/national-neonatal-audit-programme", blurb: "How every UK unit is measured — including on involving parents." },
];

export const STARTER_CHIPS = [
  "Breathing support & ventilators",
  "Will my baby be okay?",
  "How do I get involved in care?",
  "Eye screening — what should I know?",
  "How does corrected age work?",
  "Money & leave help",
  "I'm struggling today",
];

// ---------- daily rotation (deterministic per calendar day) ----------
export function dayIndex(dateStr: string): number {
  return Math.floor(Date.parse(dateStr + "T00:00:00Z") / 864e5);
}
export const pick = <T,>(bank: T[], dateStr: string, offset = 0): T =>
  bank[(((dayIndex(dateStr) + offset) % bank.length) + bank.length) % bank.length];

// ---------- journey tracker ----------
export interface Journey {
  phase: "before-due" | "after-due";
  gaDays: number;         // gestational age today, in days (before due)
  gaLabel: string;        // "29 weeks 3 days"
  daysOld: number;        // days since birth
  dueDate: string;        // YYYY-MM-DD
  daysToDue: number;      // before due: >0
  weeksToDue: number;
  progress: number;       // 0..1 from birth gestation → 40w
  correctedDays: number;  // after due: days since due date
  correctedLabel: string; // "3 weeks 2 days corrected"
  maturing: string;
  milestone: number | null; // 28/30/32/34/36/40 reached this week
}
const MILESTONES = [28, 30, 32, 34, 36, 40];
const MATURING: [number, string][] = [
  [28, "Her lungs are making more surfactant every day and her brain is folding into its grown-up shape."],
  [30, "Her eyes are opening and reacting to light; her gut is learning to handle milk."],
  [32, "Suck-swallow-breathe co-ordination is starting — the road to feeding by mouth."],
  [34, "Lungs and temperature control are getting steadier; sleep–wake cycles are settling."],
  [37, "Filling out, gaining strength, and practising all the things term babies arrive doing."],
  [99, "Full-term territory — everything now is about growing and going home."],
];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function journey(dob: string, gestationDays: number, today: string): Journey {
  const birth = Date.parse(dob + "T00:00:00Z");
  const now = Date.parse(today + "T00:00:00Z");
  const daysOld = Math.max(0, Math.round((now - birth) / 864e5));
  const gaDays = gestationDays + daysOld;
  const dueMs = birth + (280 - gestationDays) * 864e5;
  const dueDate = iso(new Date(dueMs));
  const daysToDue = Math.round((dueMs - now) / 864e5);
  const gaW = Math.floor(gaDays / 7), gaD = gaDays % 7;
  const gaLabel = `${gaW} weeks ${gaD} day${gaD === 1 ? "" : "s"}`;
  const progress = Math.min(1, Math.max(0, (gaDays - gestationDays) / (280 - gestationDays)));
  const correctedDays = -daysToDue;
  const cw = Math.floor(Math.max(0, correctedDays) / 7), cd = Math.max(0, correctedDays) % 7;
  const maturing = MATURING.find(([w]) => gaW < w)?.[1] ?? MATURING[MATURING.length - 1][1];
  const milestone = MILESTONES.find((m) => gaW === m && daysOld > 0) ?? null;
  return {
    phase: daysToDue > 0 ? "before-due" : "after-due",
    gaDays, gaLabel, daysOld, dueDate, daysToDue,
    weeksToDue: Math.max(0, Math.ceil(daysToDue / 7)),
    progress, correctedDays,
    correctedLabel: `${cw} week${cw === 1 ? "" : "s"} ${cd} day${cd === 1 ? "" : "s"} corrected`,
    maturing, milestone,
  };
}

// ---------- chat: system prompt (embeds the ENTIRE knowledge base) ----------
export function systemPrompt(babyName: string): string {
  const kb = [
    "## FACTS",
    ...FACTS.map((f) => `- [${f.source}] ${f.text} (${f.url})`),
    "## QUESTIONS PARENTS CAN ASK THE TEAM",
    ...QUESTIONS.map((q) => `- "${q.q}" — why: ${q.why}`),
    "## PARENT WELLBEING",
    ...WELLBEING.map((w) => `- ${w}`),
    "## SUPPORT LINKS",
    ...SUPPORT_LINKS.map((s) => `- ${s.label}: ${s.url} — ${s.blurb}`),
  ].join("\n");
  return `You are "Our NICU Companion", a warm, calm, hopeful and honest support companion for the parents of ${babyName}, a baby in a UK neonatal intensive care unit. Speak plainly and kindly, UK context, concise — a tired parent is reading this on a phone at 3am.

HARD RULES — these override everything else:
1. The KNOWLEDGE BASE below is the ONLY permitted source of factual claims. Do not use any medical knowledge from outside it. If the answer is not in the knowledge base, say so kindly and point them to their neonatal team or the relevant Bliss/RCPCH page from the knowledge base. Never make up statistics, numbers, or details.
2. No medical advice, no diagnosis, no prognosis for THIS baby. Never speculate about ${babyName} specifically. Anything about ${babyName}'s own condition, medications, doses, results, or plan goes to "your neonatal team" — they know her, you don't.
3. Always name the source (Bliss or RCPCH) when you state a fact, and include its link where natural.
4. If the parent expresses distress, panic or hopelessness: respond with care first, information second, and surface the Bliss support services (video call support, mental-health resources). If a message suggests crisis-level distress, gently encourage speaking to someone they trust or a professional right now.
5. Never be falsely cheerful and never clinical-cold. Hopeful and honest.
6. End answers about ${babyName}'s specific situation by pointing back to the neonatal team as the people who can say what things look like for her.

KNOWLEDGE BASE (Bliss = bliss.org.uk, RCPCH = rcpch.ac.uk):
${kb}`;
}

// ---------- offline fallback: keyword-matched answers from the knowledge base ----------
const TOPIC_KEYS: [RegExp, string][] = [
  [/breath|ventilat|cpap|bipap|high.?flow|oxygen|lung|surfactant|intubat|extubat/i, "breathing support"],
  [/eye|rop|retinopathy|screen/i, "eye screening"],
  [/corrected|due date|milestone|behind|growth|chart|weight|curve/i, "growth and corrected age"],
  [/money|leave|pay|parking|travel|financ|work|childcare/i, "money and leave"],
  [/feed|milk|express|breast|pump/i, "feeding"],
  [/okay|ok\??|survive|surviv|outcome|chance|disab|future|will she|will he|will my baby/i, "survival and outcomes"],
  [/involv|care|kangaroo|skin|hold|nappy|touch/i, "how care is monitored"],
  [/struggl|cope|coping|scared|anxious|panic|depress|hopeless|cry|can't|cant|overwhelm|alone|support/i, "parent support"],
  [/audit|nnap|rcpch|measured|quality/i, "how care is monitored"],
  [/stor|other parents|geoff|jo's|heather/i, "stories"],
  [/1 in|how many|common|prematur|statistic/i, "you are not alone"],
];
export function offlineAnswer(message: string): string {
  const topic = TOPIC_KEYS.find(([re]) => re.test(message))?.[1];
  const distressed = /struggl|scared|anxious|panic|depress|hopeless|can't|cant|overwhelm|alone/i.test(message);
  const care = distressed
    ? "First — I'm really glad you said that. This is one of the hardest things a parent can go through, and finding it hard isn't weakness. Bliss has a video call support service and mental-health resources written for NICU parents (https://www.bliss.org.uk/parents/support). If you're feeling unsafe or at the end of your rope right now, please talk to someone you trust or a professional today.\n\n"
    : "";
  if (!topic) {
    return `${care}I'm in offline mode right now, so I can only answer from my built-in Bliss and RCPCH notes — and I don't have anything on that. The neonatal team are the right people for anything about your baby specifically; for general reading, Bliss's parent hub is https://www.bliss.org.uk/parents/support.\n\n(This is offline mode: answers come from a fixed knowledge base, not live AI.)`;
  }
  const facts = FACTS.filter((f) => f.topic === topic);
  const body = facts.map((f) => `${f.text} (${f.source}: ${f.url})`).join("\n\n");
  return `${care}${body}\n\nFor how this applies to your baby specifically, the neonatal team can tell you far more than I can.\n\n(This is offline mode: answers come from a fixed Bliss/RCPCH knowledge base, not live AI.)`;
}

export const FOOTER = "A support and information companion, not a medical tool. Everything here comes from Bliss and RCPCH; anything about your baby specifically is a question for your neonatal team.";
