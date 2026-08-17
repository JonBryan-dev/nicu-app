// scripts/refresh-evidence.mjs — regenerates lib/evidence-snapshot.ts from
// PubMed. Run from web/, review the diff, then commit:
//
//     node scripts/refresh-evidence.mjs > lib/evidence-snapshot.ts
//     git diff lib/evidence-snapshot.ts        # READ THIS
//
// Set NCBI_API_KEY for the faster rate limit. Abstracts only — this never
// touches the Cochrane Library itself.
//
// Needs Node 22.18+ (built-in type stripping), so there's no build step.
import { load } from "./ts-alias.mjs";

const pubmed = await load("lib/pubmed.ts");
const evidence = await load("lib/evidence.ts");

const apiKey = process.env.NCBI_API_KEY ?? "";
const delay = apiKey ? pubmed.DELAY_MS_KEYED : pubmed.DELAY_MS;
const opts = { apiKey, retmax: 40, revalidateSeconds: 0 };

const reviews = [];
const seen = new Set();
for (const topic of evidence.TOPICS) {
  process.stderr.write(`[${topic.id}] searching…\n`);
  try {
    await pubmed.sleep(delay);
    const pmids = (await pubmed.esearch(topic.term, opts)).filter((p) => !seen.has(p));
    pmids.forEach((p) => seen.add(p));
    if (!pmids.length) {
      process.stderr.write(`  -> 0 new\n`);
      continue;
    }
    await pubmed.sleep(delay);
    const articles = await pubmed.efetch(pmids, opts);
    const latest = pubmed.latestVersions(articles);
    reviews.push(...latest.map((a) => ({ ...a, topic: topic.id })));
    process.stderr.write(`  -> ${latest.length} reviews (deduped to latest versions)\n`);
  } catch (e) {
    process.stderr.write(`  ! failed: ${e.message}\n`);
  }
}

// A review with no authors' conclusions is not worth shipping — the conclusion
// is the whole product. Drop it rather than render an empty card.
const kept = reviews.filter((r) => r.conclusions);
process.stderr.write(
  `\n${kept.length} reviews kept (${reviews.length - kept.length} dropped for having no conclusions)\n`
);

// Never print a snapshot when everything failed: this script's output is meant
// to be redirected over lib/evidence-snapshot.ts, and an empty file would wipe
// a good library because the wifi was down.
if (!kept.length) {
  process.stderr.write(
    "\nNothing fetched — refusing to write an empty snapshot. Check your connection and run it again.\n"
  );
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const header = `// lib/evidence-snapshot.ts — a committed copy of the review list, so the Lungs
// tab renders instantly and works with no signal at the cotside. Same idea as
// lib/fenton-data.ts: reference data, in the repo, with its provenance stated.
//
// Source: PubMed E-utilities (esearch + efetch), abstracts only. The Cochrane
// Library full texts are paywalled and are never fetched.
//
// GENERATED — do not edit by hand. Regenerate with:
//     cd web && node scripts/refresh-evidence.mjs > lib/evidence-snapshot.ts
// then READ THE DIFF before committing. Every conclusion that ships here has
// been looked at by a human — that is the point of a snapshot rather than a
// live feed.

import type { Review } from "@/lib/evidence";

export const SNAPSHOT_FETCHED = ${JSON.stringify(today)};
export const SNAPSHOT: Review[] = ${JSON.stringify(kept, null, 2)};
`;

process.stdout.write(header);
