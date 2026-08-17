// scripts/test-evidence.mjs — unit tests for the PubMed extractor, the Cochrane
// version dedupe, the recommendation guard, and the breathing-timeline maths.
// Run from web/: node scripts/test-evidence.mjs
// Needs Node 22.18+ (built-in type stripping). No test runner, no build step,
// and — unlike test-gas.mjs — no esbuild download, so it runs offline.
//
// The XML fixture below is SYNTHETIC. It mirrors PubMed's structure — nested
// markup, entities, MedlineDate, a missing DOI, .pub versioning — but the
// clinical text is deliberately made up, because inventing an authors'
// conclusion and passing it off as real is exactly what this app must not do.
import { load } from "./ts-alias.mjs";

const P = await load("lib/pubmed.ts");
const E = await load("lib/evidence.ts");
const T = await load("lib/respTimeline.ts");

let pass = 0,
  fail = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};
const ok = (name, cond) => eq(name, !!cond, true);

// ---------------------------------------------------------------- fixture
const XML = `<?xml version="1.0"?>
<PubmedArticleSet>
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">11111111</PMID>
    <Article>
      <Journal><JournalIssue><PubDate><Year>2019</Year><Month>Feb</Month></PubDate></JournalIssue></Journal>
      <ArticleTitle>Widgets versus <i>sprockets</i> after extubation in preterm infants</ArticleTitle>
      <Abstract>
        <AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">Fictional background text.</AbstractText>
        <AbstractText Label="AUTHORS' CONCLUSIONS" NlmCategory="CONCLUSIONS">Made-up conclusion for version two; teams should consider widgets.</AbstractText>
      </Abstract>
    </Article>
  </MedlineCitation>
  <PubmedData><ArticleIdList>
    <ArticleId IdType="pubmed">11111111</ArticleId>
    <ArticleId IdType="doi">10.1002/14651858.CD999999.pub2</ArticleId>
  </ArticleIdList></PubmedData>
</PubmedArticle>
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">22222222</PMID>
    <Article>
      <Journal><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
      <ArticleTitle>Widgets versus sprockets after extubation in preterm infants</ArticleTitle>
      <Abstract>
        <AbstractText Label="AUTHORS' CONCLUSIONS" NlmCategory="CONCLUSIONS">Made-up conclusion for version three &amp; a bit, with CO&lt;sub&gt;2&lt;/sub&gt; mentioned.</AbstractText>
      </Abstract>
    </Article>
  </MedlineCitation>
  <PubmedData><ArticleIdList>
    <ArticleId IdType="doi">10.1002/14651858.CD999999.pub3</ArticleId>
  </ArticleIdList></PubmedData>
</PubmedArticle>
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">33333333</PMID>
    <Article>
      <Journal><JournalIssue><PubDate><MedlineDate>2021 Nov-Dec</MedlineDate></PubDate></JournalIssue></Journal>
      <ArticleTitle>A review with no DOI and a &amp;lsquo;quoted&amp;rsquo; phrase</ArticleTitle>
      <Abstract>
        <AbstractText>Unlabelled abstract body only.</AbstractText>
      </Abstract>
    </Article>
  </MedlineCitation>
  <PubmedData><ArticleIdList><ArticleId IdType="pubmed">33333333</ArticleId></ArticleIdList></PubmedData>
</PubmedArticle>
</PubmedArticleSet>`;

// ---------------------------------------------------------------- parser
const arts = P.parseArticles(XML);
eq("parses three articles", arts.length, 3);
eq("pmid", arts[0].pmid, "11111111");
eq("strips inline markup from the title", arts[0].title, "Widgets versus sprockets after extubation in preterm infants");
eq("year from PubDate/Year", arts[0].year, 2019);
eq("doi", arts[0].doi, "10.1002/14651858.CD999999.pub2");
eq("labelled sections kept", arts[0].sections.length, 2);
ok("conclusions extracted", arts[0].conclusions.startsWith("Made-up conclusion for version two"));
ok("entity decoded in conclusions", arts[1].conclusions.includes("&"));
ok("escaped markup stripped from conclusions", !arts[1].conclusions.includes("<sub>"));
eq("MedlineDate year fallback", arts[2].year, 2021);
eq("missing doi is null", arts[2].doi, null);
eq("unlabelled abstract gets a default label", arts[2].sections[0].label, "ABSTRACT");
eq("no structured conclusion", arts[2].conclusions, null);

eq("decodeEntities numeric", P.decodeEntities("&#8217;"), "’");
eq("decodeEntities hex", P.decodeEntities("&#x2018;"), "‘");
eq("stripTags collapses whitespace", P.stripTags("<b>a</b>   b\n c"), "a b c");

// ---------------------------------------------------------------- dedupe
eq("baseCd from a Cochrane doi", P.baseCd("10.1002/14651858.CD000104.pub4"), "CD000104");
eq("baseCd on a non-Cochrane doi", P.baseCd("10.1000/xyz"), null);
eq("baseCd on null", P.baseCd(null), null);

const latest = P.latestVersions(arts);
eq("dedupes .pub2 and .pub3 to one review", latest.length, 2);
eq("keeps the later version", latest.find((r) => P.baseCd(r.doi) === "CD999999").year, 2024);
ok("a review with no CD number survives on its pmid", latest.some((r) => r.pmid === "33333333"));

// ---------------------------------------------------------------- guard
ok("flags 'should'", E.hedgeFlag("Clinicians should consider this."));
ok("flags 'is recommended'", E.hedgeFlag("Routine use is recommended."));
ok("flags 'first-line'", E.hedgeFlag("It may be a first-line option."));
eq("does not flag a neutral conclusion", E.hedgeFlag("The evidence remains uncertain."), null);
eq("null in, null out", E.hedgeFlag(null), null);
ok("the real fixture conclusion trips the guard", E.hedgeFlag(arts[0].conclusions));

// ---------------------------------------------------------------- questions
eq("every topic has a question bank", E.TOPICS.filter((t) => !(E.TOPIC_QUESTIONS[t.id] || []).length).length, 0);
for (const t of E.TOPICS) {
  ok(`questionsFor is never empty (${t.id})`, E.questionsFor({ topic: t.id }, null).length > 0);
}
ok("a landmark review gets its own question first", E.questionsFor({ topic: "extubation" }, "CD003212")[0].id === "cd003212-1");
eq("eight topics", E.TOPICS.length, 8);
ok("every topic term is scoped to Cochrane", E.TOPICS.every((t) => P.buildTerm(t.term).includes("Cochrane Database Syst Rev")));

// ---------------------------------------------------------------- timeline
// A synthetic 25-week course: intubated at birth, extubated day 10, back on the
// ventilator day 12, extubated again day 21 and it holds.
const dob = "2026-01-01";
const day = (n, h = 12) =>
  new Date(Date.parse(`${dob}T00:00:00Z`) + n * 864e5 + h * 3600e3).toISOString();
const gases = [
  { taken_at: day(0), support_mode: "vent" },
  { taken_at: day(5), support_mode: "vent" },
  { taken_at: day(10), support_mode: "cpap" },
  { taken_at: day(12), support_mode: "vent" },
  { taken_at: day(21), support_mode: "cpap" },
  { taken_at: day(30), support_mode: "highflow" },
];
const ladder = T.ladderFromGases(gases);
eq("ladder drops rows with no mode", ladder.length, 6);

const derived = T.derivedEvents(ladder);
const kinds = derived.map((e) => e.kind);
eq("derived event kinds", kinds, ["intubation", "extubation", "reintubation", "extubation", "step_down"]);

const merged = T.mergeEvents(derived, []);
const stats = T.respStats(ladder, merged, dob, "2026-02-10"); // day 40
eq("vent episodes", stats.ventEpisodes, 2);
eq("extubation attempts", stats.extubationAttempts, 2);
eq("reintubations", stats.reintubations, 1);
eq("days to a first extubation that held", stats.daysToFirstSuccess, 21);
eq("current mode", stats.currentMode, "highflow");
eq("lowest rung reached", stats.lowestModeReached, "highflow");
eq("days on the ventilator", stats.daysOnVent, 19); // 0->10 plus 12->21
eq("largest gap between gases", stats.sampleGapDays, 9);

// the first extubation did NOT hold, so it must not be counted as the success
ok("first extubation is not mistaken for a success", stats.daysToFirstSuccess !== 10);

// a hand-logged extubation within the window replaces the derived one
const logged = [
  { id: "x1", kind: "extubation", at: day(21, 9), detail: "at the 9am round", note: null },
];
const mergedLogged = T.mergeEvents(derived, logged);
eq(
  "logged event supersedes the derived one",
  mergedLogged.filter((e) => e.kind === "extubation").length,
  2
);
ok(
  "and it is the logged version that survives",
  mergedLogged.some((e) => e.kind === "extubation" && e.source === "logged" && e.detail === "at the 9am round")
);

// an event far from any derived one is kept alongside
const far = [{ id: "x2", kind: "caffeine_start", at: day(2), detail: null, note: null }];
eq("unrelated logged events are kept", T.mergeEvents(derived, far).length, derived.length + 1);

// empty inputs must not throw
const empty = T.respStats([], [], dob, "2026-02-10");
eq("empty ladder gives a null current mode", empty.currentMode, null);
eq("empty ladder gives zero vent days", empty.daysOnVent, 0);
eq("no comparisons without data", T.compareToCohort(empty, 178).length, 0);

const comps = T.compareToCohort(stats, 178);
ok("comparisons are produced", comps.length >= 3);
ok("comparisons never render a verdict", !comps.some((c) => /ahead|behind|good|bad|worse|better/i.test(c.typical)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
