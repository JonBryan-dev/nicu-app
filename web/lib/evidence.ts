// lib/evidence.ts — the curated layer of the Lungs tab: the eight Cochrane
// search topics, a plain-English glossary, the per-topic "questions to ask the
// team", the cohort baseline figures, and a deterministic guard that spots
// recommendation-shaped language in an authors' conclusion. Pure module, no I/O.
//
// This is evidence context, NOT medical advice. Its purpose is to help one dad
// understand what the ventilator settings, extubation attempts and support-mode
// changes he sees actually mean against the best available evidence — never to
// second-guess the clinical team, whose read on THIS baby always takes
// precedence.
//
// HARD RULES, carried from his notes:
//  1. Abstracts only, from PubMed's open API. Cochrane full texts are paywalled
//     and are never fetched.
//  2. Authors' conclusions are shown VERBATIM and in quotation marks, never
//     paraphrased. Paraphrasing is where a recommendation leaks in.
//  3. Anything that would read as a treatment recommendation is reframed as a
//     question to ask the team. Those questions are curated here, by hand —
//     they are never generated from the abstract text.
//  4. Nothing here is invented. Review titles, years and conclusions come from
//     the API or they do not appear at all.

import type { ParsedArticle } from "@/lib/pubmed";

export const BANNER =
  "Research about babies like her — not about her. Abstracts only, from PubMed's open library. Whatever the reviews say, the team's read on this baby is the one that decides anything.";

export const FOOTER =
  "Evidence context, not medical advice. These are summaries of research across thousands of babies; your neonatal team are the only people who can say what any of it means for her. If something here worries you, the right move is to ask them — that is what the questions are for.";

// ---------- topics ----------

export type TopicId =
  | "extubation"
  | "non_invasive_support"
  | "mechanical_ventilation"
  | "caffeine_methylxanthines"
  | "surfactant"
  | "steroids_bpd"
  | "bpd_prevention_other"
  | "weaning_strategies";

export interface Topic {
  id: TopicId;
  label: string;
  /** the PubMed boolean, verbatim from the extractor prototype */
  term: string;
  blurb: string;
}

export const TOPICS: Topic[] = [
  {
    id: "extubation",
    label: "Coming off the ventilator",
    term: '(extubation OR "extubation failure" OR reintubation) AND (preterm OR premature OR neonat*)',
    blurb:
      "Taking the breathing tube out, and what happens when it has to go back in. At this gestation, needing more than one attempt is the norm rather than the exception.",
  },
  {
    id: "non_invasive_support",
    label: "CPAP, NIPPV and high-flow",
    term: '("nasal intermittent positive pressure" OR NIPPV OR "continuous positive airway pressure" OR CPAP OR "high flow nasal cannula") AND (preterm OR neonat*)',
    blurb:
      "The support that works through her nose rather than a tube — what the ladder below the ventilator is made of, and how the rungs compare.",
  },
  {
    id: "mechanical_ventilation",
    label: "On the ventilator",
    term: '("mechanical ventilation" OR "volume-targeted" OR "high frequency oscillat*" OR "synchronized ventilation") AND (preterm OR neonat*)',
    blurb:
      "How the ventilator itself is set up — volume-targeted versus pressure-limited, oscillators, synchronised modes. This is what most of the numbers on the screen are about.",
  },
  {
    id: "caffeine_methylxanthines",
    label: "Caffeine",
    term: '(caffeine OR methylxanthine* OR aminophylline OR theophylline) AND (preterm OR "apnea of prematurity")',
    blurb:
      "One of the most studied drugs in neonatal care. It nudges the brain's breathing drive, and it turns up constantly around extubation.",
  },
  {
    id: "surfactant",
    label: "Surfactant",
    term: '(surfactant) AND (preterm OR "respiratory distress syndrome") AND neonat*',
    blurb:
      "The soapy substance that stops the tiny air sacs collapsing. Premature lungs make too little of it, so it is given directly — usually in the first days.",
  },
  {
    id: "steroids_bpd",
    label: "Steroids and chronic lung disease",
    term: '(corticosteroid* OR dexamethasone OR hydrocortisone OR budesonide) AND ("chronic lung disease" OR "bronchopulmonary dysplasia" OR preterm)',
    blurb:
      "The most finely balanced decisions in the whole of neonatal respiratory care. Expect the conclusions here to be heavily hedged — that hedging is real, and it is the team's job to weigh it for her.",
  },
  {
    id: "bpd_prevention_other",
    label: "Protecting the lungs long-term",
    term: '("bronchopulmonary dysplasia" OR "chronic lung disease") AND (prevent* OR "vitamin A" OR "inhaled nitric oxide") AND (preterm OR neonat*)',
    blurb:
      "Everything else aimed at the lungs she will still have at a year old — vitamin A, nitric oxide, and the rest.",
  },
  {
    id: "weaning_strategies",
    label: "Weaning and readiness",
    term: '(weaning OR "extubation readiness" OR "spontaneous breathing trial") AND (preterm OR neonat*)',
    blurb:
      "How teams decide she is ready to come down a rung, and how they step the support back.",
  },
];

export const TOPIC_BY_ID: Record<TopicId, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t])
) as Record<TopicId, Topic>;

// ---------- reviews ----------

export interface Review extends ParsedArticle {
  topic: TopicId;
}

/** Group reviews under their topic, in TOPICS order. */
export function byTopic(reviews: Review[]): { topic: Topic; reviews: Review[] }[] {
  return TOPICS.map((topic) => ({
    topic,
    reviews: reviews.filter((r) => r.topic === topic.id),
  })).filter((g) => g.reviews.length > 0);
}

// ---------- cohort baselines (NOT Cochrane) ----------

export interface CohortFigure {
  stat: string;
  detail: string;
}

/** Context figures from cohort literature, not from systematic reviews. The UI
 *  badges them separately for exactly that reason — they describe what tends to
 *  happen to groups of 25-week babies, not what will happen to her. */
export const COHORT_SOURCE = "Cohort literature — not Cochrane";
export const COHORT: CohortFigure[] = [
  { stat: "~95%", detail: "of babies born at 25 weeks need mechanical ventilation at some point." },
  { stat: "~12 days", detail: "is the median time to a first successful extubation at 25 weeks." },
  { stat: "~50%", detail: "of babies born before 26 weeks do not get past their first extubation attempt." },
  { stat: "~48%", detail: "are reintubated at least once; on average each reintubation adds around 12 more days of ventilation." },
  { stat: "1–3 cycles", detail: "of intubation is the typical journey from 25 to about 32 weeks corrected, with CPAP or NIPPV in between attempts." },
];

export const COHORT_NOTE =
  "Averages are averages. They are here so the shape of the road is less of a shock — not to predict her. Two babies born the same week can travel this very differently, and the team are the ones who can say how she is actually doing.";

// ---------- questions to ask the team ----------

export interface EvidenceQuestion {
  id: string;
  q: string;
  why: string;
}

/** Three or four per topic. Every review carries the topic of the search that
 *  found it, so this binding is total — a review fetched live that nobody has
 *  hand-tuned still gets a sensible question set. */
export const TOPIC_QUESTIONS: Record<TopicId, EvidenceQuestion[]> = {
  extubation: [
    { id: "ext-1", q: "What are you looking for before you'd try taking the tube out again?", why: "Turns a wait into a checklist you can follow along with." },
    { id: "ext-2", q: "If this attempt doesn't hold, what's the plan — straight back to the ventilator, or a step onto CPAP or NIPPV first?", why: "Knowing the fallback in advance makes a reintubation much less frightening when it happens." },
    { id: "ext-3", q: "Is the number of attempts she's had so far what you'd expect for her gestation?", why: "The honest answer at 25 weeks is usually yes — but it helps enormously to hear it from them." },
    { id: "ext-4", q: "What will you put her on straight after the tube comes out?", why: "What she is extubated ONTO is one of the most studied questions in this whole area." },
  ],
  non_invasive_support: [
    { id: "niv-1", q: "Which rung of the support ladder is she on today, and what would take her down one?", why: "Gives you the same map the team is using." },
    { id: "niv-2", q: "Is she on CPAP or NIPPV — and what made you choose that one for her?", why: "The two are genuinely different, and the choice is deliberate." },
    { id: "niv-3", q: "Is high-flow something she'd move to later, or not for her?", why: "High-flow is gentler on the nose but not right for every baby at every stage." },
  ],
  mechanical_ventilation: [
    { id: "mv-1", q: "Which mode is she ventilated on, and what does that mode actually do differently?", why: "The mode name on the screen is the single most useful thing to understand." },
    { id: "mv-2", q: "Are you targeting a set volume for each breath, or a set pressure?", why: "This is one of the better-studied comparisons in neonatal ventilation." },
    { id: "mv-3", q: "Which numbers on the ventilator would you most want to see change this week?", why: "Tells you what 'better' looks like before it happens." },
    { id: "mv-4", q: "Is she doing more of the breathing herself than she was a week ago?", why: "Trend over weeks is the thing that matters, not any single day." },
  ],
  caffeine_methylxanthines: [
    { id: "caf-1", q: "Is she on caffeine, and when did it start?", why: "It is close to routine at this gestation, but worth knowing where she is with it." },
    { id: "caf-2", q: "Will the caffeine carry on through the next extubation attempt?", why: "Caffeine and extubation are closely linked in the research." },
    { id: "caf-3", q: "When would you expect to stop it, and what do you watch for afterwards?", why: "Stopping caffeine is a milestone with its own settling-in period." },
  ],
  surfactant: [
    { id: "surf-1", q: "How many doses of surfactant has she had, and were they given down a tube or by a less invasive method?", why: "How it was given is a real difference, not a detail." },
    { id: "surf-2", q: "Would she have any more, or is that chapter closed?", why: "Surfactant is usually an early-days thing; knowing it's done is reassuring." },
  ],
  steroids_bpd: [
    { id: "ster-1", q: "Is a steroid course something you're weighing for her at the moment?", why: "Asks about the decision without asking you to have an opinion on it." },
    { id: "ster-2", q: "If you did use them, what would you be hoping to gain, and what would you be watching out for?", why: "Both sides of the balance, in their words, about her." },
    { id: "ster-3", q: "Where does she sit on the risk of chronic lung disease as things stand?", why: "Grounds an abstract worry in her actual situation." },
  ],
  bpd_prevention_other: [
    { id: "bpd-1", q: "What does chronic lung disease mean for a baby like her in practice — at discharge, and at a year old?", why: "The label sounds far more permanent than it usually is." },
    { id: "bpd-2", q: "Is there anything you're doing specifically to protect her lungs longer-term?", why: "Opens up vitamin A, nitric oxide and the rest without needing to name them." },
    { id: "bpd-3", q: "Is there anything I can do that helps her lungs?", why: "Skin-to-skin, milk and being there are not nothing, and they will tell you so." },
  ],
  weaning_strategies: [
    { id: "wean-1", q: "What tells you she's ready to come down a rung?", why: "The readiness criteria are the whole game." },
    { id: "wean-2", q: "Do you do any kind of breathing trial before deciding?", why: "Some units do, some don't — either answer is informative." },
    { id: "wean-3", q: "Over the last fortnight, is her support heading in the right direction overall?", why: "The single best question in the NICU. Zoom out; the daily picture lies." },
  ],
};

/** Extra questions for the landmark reviews, keyed by Cochrane CD number (from
 *  the DOI) rather than PMID — CD numbers are stable across versions. */
export const REVIEW_QUESTIONS: Record<string, EvidenceQuestion[]> = {
  CD003212: [
    { id: "cd003212-1", q: "When the tube comes out, would she go onto NIPPV rather than plain CPAP?", why: "This review is specifically about that comparison after extubation." },
  ],
  CD003666: [
    { id: "cd003666-1", q: "Is her ventilator volume-targeted?", why: "This review is the volume-targeted versus pressure-limited comparison." },
  ],
  CD000104: [
    { id: "cd000104-1", q: "Has an oscillator been considered for her, or is conventional ventilation the plan?", why: "This review compares the two as a first choice." },
  ],
  CD001243: [
    { id: "cd001243-1", q: "What CPAP pressure is she on, and what would make you change it?", why: "This review is about CPAP after the tube comes out." },
  ],
  CD000140: [
    { id: "cd000140-1", q: "Is the caffeine timed around the extubation attempt?", why: "This review looks at caffeine given around that moment." },
  ],
};

/** Questions for a review: its own, if it is one of the landmarks, plus its
 *  topic's bank. Never empty. */
export function questionsFor(r: Review, cd: string | null): EvidenceQuestion[] {
  const specific = cd ? REVIEW_QUESTIONS[cd.toUpperCase()] ?? [] : [];
  return [...specific, ...TOPIC_QUESTIONS[r.topic]];
}

// ---------- the recommendation guard ----------

/** Authors' conclusions are written for clinicians setting unit policy across
 *  thousands of babies. These are the shapes that read like an instruction when
 *  a parent meets them at 3am. */
export const RECOMMENDATION_PATTERNS: RegExp[] = [
  /\bshould\b/i,
  /\bwe recommend\b/i,
  /\bis recommended\b/i,
  /\brecommendations?\b/i,
  /\bfirst[- ]line\b/i,
  /\bsuperior to\b/i,
  /\bpreferred\b/i,
  /\bshould be considered\b/i,
  /\bmust be\b/i,
  /\bthe treatment of choice\b/i,
];

export const HEDGE_NOTE =
  "That sentence is written for clinicians setting policy across thousands of babies. The version of it that is useful to you is the question below — the team's read on her is what decides anything.";

/** Does this conclusion read like an instruction? Deterministic, so a quote
 *  never renders differently on two different nights. */
export function hedgeFlag(text: string | null): string | null {
  if (!text) return null;
  return RECOMMENDATION_PATTERNS.some((re) => re.test(text)) ? HEDGE_NOTE : null;
}

// ---------- glossary ----------

export interface GlossaryTerm {
  term: string;
  expand?: string;
  plain: string;
}

/** Curated by hand, not generated from abstracts: a definition scraped out of a
 *  clinician-facing abstract would sometimes simply be wrong, and wrong is the
 *  one thing this app must not be. Bliss's own glossary is linked from the tab
 *  for everything not covered here. */
export const GLOSSARY: GlossaryTerm[] = [
  { term: "PEEP", expand: "positive end-expiratory pressure", plain: "The bit of pressure left in the lungs between breaths so the tiny air sacs don't collapse flat and have to be reopened each time." },
  { term: "PIP", expand: "peak inspiratory pressure", plain: "The highest pressure reached during a machine breath — the push that gets air in." },
  { term: "MAP", expand: "mean airway pressure", plain: "The average pressure across the whole breathing cycle. A good single number for 'how hard is the machine working'." },
  { term: "FiO₂", expand: "fraction of inspired oxygen", plain: "How much of what she is breathing is oxygen. Room air is 21%. Lower is better, and it is the number most parents learn to read first." },
  { term: "SpO₂", expand: "oxygen saturation", plain: "How much of the haemoglobin in her blood is carrying oxygen, measured through the skin. The number the monitor alarms about." },
  { term: "Tidal volume", plain: "The size of each breath, usually measured in millilitres per kilo of her weight. Too big stretches the lungs; too small doesn't clear CO₂." },
  { term: "VTV", expand: "volume-targeted ventilation", plain: "The ventilator aims for a set breath SIZE and varies the pressure to get there — rather than setting a fixed pressure and letting the volume fall where it may." },
  { term: "HFOV", expand: "high-frequency oscillatory ventilation", plain: "The oscillator. Instead of proper breaths it vibrates a continuous pressure very fast, so the chest wobbles rather than rises. It looks alarming and often isn't." },
  { term: "SIMV", expand: "synchronised intermittent mandatory ventilation", plain: "The ventilator gives a set number of breaths per minute and times them to her own efforts, so it isn't fighting her." },
  { term: "CPAP", expand: "continuous positive airway pressure", plain: "A steady pressure through her nose that holds the lungs open. She does all the breathing herself; CPAP just makes it easier." },
  { term: "NIPPV", expand: "nasal intermittent positive pressure ventilation", plain: "Like CPAP, but with extra pushes on top of the steady pressure. A rung above CPAP, still through the nose rather than a tube." },
  { term: "BiPAP / NIV", plain: "Non-invasive support that alternates between two pressure levels. Sits alongside NIPPV on the ladder." },
  { term: "High-flow", expand: "HFNC, high-flow nasal cannula", plain: "Warmed, humidified air and oxygen through small nasal prongs. Gentler on the nose than CPAP, and usually a step further down." },
  { term: "ETT", expand: "endotracheal tube", plain: "The breathing tube itself, going through the mouth or nose into the windpipe." },
  { term: "Intubation", plain: "Putting the breathing tube in." },
  { term: "Extubation", plain: "Taking the breathing tube out." },
  { term: "Reintubation", plain: "Putting it back in after an extubation didn't hold. Common before 26 weeks, and not a failure on anyone's part." },
  { term: "LISA / MIST", expand: "less invasive surfactant administration", plain: "Giving surfactant down a very thin tube while she keeps breathing on CPAP, instead of intubating her for it." },
  { term: "Surfactant", plain: "The soapy substance that stops air sacs collapsing. Premature lungs make too little, so it is given directly, usually in the first days." },
  { term: "Caffeine", plain: "Caffeine citrate — a drug that nudges the brain's breathing drive so she remembers to breathe and pauses less. Nearly every very premature baby gets it." },
  { term: "Apnoea of prematurity", plain: "Pauses in breathing because the part of the brain that drives breathing is still immature. It is a maturity thing, and it passes." },
  { term: "Desaturation / 'a desat'", plain: "A dip in the oxygen saturation number. Frequent dips that self-correct are part of NICU life at this gestation." },
  { term: "Bradycardia / 'a brady'", plain: "A dip in heart rate, often alongside a desat." },
  { term: "Permissive hypercapnia", plain: "Deliberately accepting a higher CO₂ than you would in an adult, so the ventilator can be gentler on very fragile lungs. A choice, not an oversight." },
  { term: "BPD / CLD", expand: "bronchopulmonary dysplasia / chronic lung disease", plain: "A diagnosis given when a baby still needs breathing support at a set point (often 36 weeks corrected). It sounds far more permanent than it usually turns out to be." },
  { term: "RDS", expand: "respiratory distress syndrome", plain: "The breathing difficulty of the first days caused by not enough surfactant. Nearly universal at 25 weeks." },
  { term: "PDA", expand: "patent ductus arteriosus", plain: "A blood vessel that should close after birth staying open. It can push extra blood through the lungs and make breathing harder." },
  { term: "PIE", expand: "pulmonary interstitial emphysema", plain: "Air leaking into the tissue of the lung itself from pressure. One of the reasons teams keep pressures as low as they can get away with." },
  { term: "Pneumothorax", plain: "Air escaping outside the lung into the chest. Treatable, and one of the risks ventilation strategies are judged on." },
  { term: "Corrected age", plain: "Her age counted from her due date rather than her birthday. The right yardstick for almost everything developmental." },
  { term: "PMA", expand: "postmenstrual age", plain: "Gestational age at birth plus how old she is now — 'she's 29 weeks corrected'. The number the team plan around." },
];

/** Acronyms appearing in a title or conclusion, so the UI can offer the plain
 *  English without generating any text. Case-sensitive on acronyms so 'map'
 *  in prose doesn't match MAP. */
export function findTerms(text: string): GlossaryTerm[] {
  if (!text) return [];
  return GLOSSARY.filter((g) => {
    const head = g.term.split(" ")[0].replace(/[₂]/g, "2");
    if (head.length < 3) return false;
    const body = text.replace(/[₂]/g, "2");
    const re = new RegExp(`\\b${head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, /^[A-Z0-9]+$/.test(head) ? "" : "i");
    return re.test(body);
  });
}
