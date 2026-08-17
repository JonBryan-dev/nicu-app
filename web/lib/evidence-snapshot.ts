// lib/evidence-snapshot.ts — a committed copy of the review list, so the Lungs
// tab renders instantly and works with no signal at the cotside. Same idea as
// lib/fenton-data.ts: reference data, in the repo, with its provenance stated.
//
// Source: PubMed E-utilities (esearch + efetch), abstracts only. The Cochrane
// Library full texts are paywalled and are never fetched.
//
// Regenerate with:
//     cd web && node scripts/refresh-evidence.mjs > lib/evidence-snapshot.ts
// then READ THE DIFF before committing. Every conclusion that ships here has
// been looked at by a human — that is the point of a snapshot rather than a
// live feed, and it is what keeps unreviewed clinician-register text about
// postnatal steroids from appearing in the app unannounced.
//
// SNAPSHOT_FETCHED is empty until it has been generated for the first time.
// While it is empty the tab falls back to the live route, and if that is
// unreachable it says so plainly rather than showing nothing.

import type { Review } from "@/lib/evidence";

export const SNAPSHOT_FETCHED = "";
export const SNAPSHOT: Review[] = [];
