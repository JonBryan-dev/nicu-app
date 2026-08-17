// lib/pubmed.ts — a minimal client for NCBI's PubMed E-utilities: URL builders,
// a hand-rolled extractor for the handful of fields we need out of efetch XML,
// and Cochrane version de-duplication. Pure except for fetchTopic/fetchAll.
//
// ABSTRACTS ONLY, from PubMed's open API. The Cochrane Library full texts are
// paywalled and must never be fetched — that boundary is the whole reason this
// file talks to eutils and nothing else.
//
// Why a hand-rolled extractor instead of an XML parser dependency: we need five
// fields out of a schema that has not changed in twenty years, and CLAUDE.md
// keeps the dependency list deliberately tiny. The scanner below is
// deterministic and unit-tested against a fixture in scripts/test-evidence.mjs.

export const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
export const COCHRANE_FILTER = '"Cochrane Database Syst Rev"[Journal]';
export const TOOL = "nicu-companion";

// NCBI asks for 3 req/s unauthenticated, 10 req/s with a key.
export const DELAY_MS = 340;
export const DELAY_MS_KEYED = 110;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- URLs ----------

/** Scope any topic term to the Cochrane Database of Systematic Reviews. */
export function buildTerm(topicTerm: string): string {
  return `(${topicTerm}) AND ${COCHRANE_FILTER}`;
}

export function searchUrl(term: string, retmax = 40, apiKey = ""): string {
  const p = new URLSearchParams({
    db: "pubmed",
    term: buildTerm(term),
    retmax: String(retmax),
    sort: "pub_date",
    retmode: "json",
    tool: TOOL,
  });
  if (apiKey) p.set("api_key", apiKey);
  return `${EUTILS}/esearch.fcgi?${p}`;
}

export function fetchUrl(pmids: string[], apiKey = ""): string {
  const p = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
    tool: TOOL,
  });
  if (apiKey) p.set("api_key", apiKey);
  return `${EUTILS}/efetch.fcgi?${p}`;
}

// ---------- text helpers ----------

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  ndash: "–", mdash: "—", hellip: "…", deg: "°",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
    // &amp;lt; style double-encoding shows up in a few older records
    .replace(/&amp;/g, "&");
}

/** Drop inline markup (<i>, <sub>, <sup>, <b>) that PubMed puts inside titles
 *  and abstract text, then collapse whitespace. Stripped twice around the
 *  entity decode, because a fair few records carry markup that was escaped
 *  rather than emitted as tags (`CO&lt;sub&gt;2&lt;/sub&gt;`) and a literal
 *  "<sub>" in the middle of a sentence reads as a bug. */
export function stripTags(s: string): string {
  const once = decodeEntities(s.replace(/<[^>]*>/g, ""));
  return once.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// ---------- efetch XML ----------

export interface AbstractSection {
  label: string;
  text: string;
}

export interface ParsedArticle {
  pmid: string;
  title: string;
  year: number | null;
  doi: string | null;
  sections: AbstractSection[];
  /** The AUTHORS' CONCLUSIONS section — the clinically decisive part of a
   *  Cochrane abstract. Null when the record has no structured conclusion. */
  conclusions: string | null;
}

// In the order the Python prototype tries them.
const CONCLUSION_LABELS = [
  "AUTHORS' CONCLUSIONS",
  "AUTHORS CONCLUSIONS",
  "AUTHORS’ CONCLUSIONS", // curly apostrophe — PubMed emits both
  "CONCLUSIONS",
  "CONCLUSION",
];

function firstBlock(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function parseYear(article: string): number | null {
  const pub = firstBlock(article, "PubDate");
  if (!pub) return null;
  const y = pub.match(/<Year>\s*(\d{4})\s*<\/Year>/);
  if (y) return parseInt(y[1], 10);
  // MedlineDate fallback: "2023 Feb-Mar", "2019-2020"
  const md = pub.match(/<MedlineDate>[^<]*?(\d{4})/);
  return md ? parseInt(md[1], 10) : null;
}

function parseDoi(article: string): string | null {
  const re = /<ArticleId\b[^>]*IdType="doi"[^>]*>([\s\S]*?)<\/ArticleId>/gi;
  let doi: string | null = null;
  let m: RegExpExecArray | null;
  // last one wins, matching the prototype's loop
  while ((m = re.exec(article))) doi = stripTags(m[1]) || doi;
  return doi;
}

function parseSections(article: string): AbstractSection[] {
  const abs = firstBlock(article, "Abstract");
  if (!abs) return [];
  const out: AbstractSection[] = [];
  const re = /<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(abs))) {
    const attrs = m[1];
    const label =
      attrs.match(/\bLabel="([^"]*)"/)?.[1] ??
      attrs.match(/\bNlmCategory="([^"]*)"/)?.[1] ??
      "ABSTRACT";
    const text = stripTags(m[2]);
    if (!text) continue;
    const key = decodeEntities(label).toUpperCase();
    const existing = out.find((s) => s.label === key);
    if (existing) existing.text += " " + text;
    else out.push({ label: key, text });
  }
  return out;
}

export function parseArticles(xml: string): ParsedArticle[] {
  const out: ParsedArticle[] = [];
  const re = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const article = m[1];
    // first PMID in document order is MedlineCitation's — reference lists come later
    const pmid = article.match(/<PMID\b[^>]*>\s*(\d+)\s*<\/PMID>/)?.[1] ?? "";
    const rawTitle = firstBlock(article, "ArticleTitle");
    const title = rawTitle ? stripTags(rawTitle) : "";
    if (!title || !pmid) continue;
    const sections = parseSections(article);
    const conclusions =
      CONCLUSION_LABELS.map((l) => sections.find((s) => s.label === l)?.text).find(Boolean) ??
      null;
    out.push({ pmid, title, year: parseYear(article), doi: parseDoi(article), sections, conclusions });
  }
  return out;
}

// ---------- Cochrane versioning ----------

/** '10.1002/14651858.CD000104.pub4' -> 'CD000104'. Null if not a Cochrane DOI. */
export function baseCd(doi: string | null): string | null {
  if (!doi) return null;
  return doi.match(/(CD\d{6})/i)?.[1].toUpperCase() ?? null;
}

/** Cochrane updates share a base DOI and differ only by .pubN — keep the latest
 *  version of each review. Records with no CD number fall back to their PMID so
 *  nothing is silently dropped. */
export function latestVersions<T extends { pmid: string; doi: string | null; year: number | null }>(
  rows: T[]
): T[] {
  const byBase = new Map<string, T>();
  for (const r of rows) {
    const key = baseCd(r.doi) ?? r.pmid;
    const cur = byBase.get(key);
    if (!cur || (r.year ?? 0) > (cur.year ?? 0)) byBase.set(key, r);
  }
  return [...byBase.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

// ---------- network ----------

export interface FetchOpts {
  apiKey?: string;
  retmax?: number;
  revalidateSeconds?: number;
  timeoutMs?: number;
}

// `next` is Next's own addition to RequestInit; spelled out here so this module
// also typechecks (and runs) outside the Next build, e.g. from scripts/.
type CachedInit = RequestInit & { next?: { revalidate?: number } };

function init(o: FetchOpts): CachedInit {
  return {
    headers: { "User-Agent": `${TOOL}/1.0` },
    signal: AbortSignal.timeout(o.timeoutMs ?? 12000),
    next: { revalidate: o.revalidateSeconds ?? 604800 },
  };
}

async function getJson(url: string, o: FetchOpts): Promise<unknown> {
  const res = await fetch(url, init(o));
  if (!res.ok) throw new Error(`esearch ${res.status}`);
  return res.json();
}

async function getText(url: string, o: FetchOpts): Promise<string> {
  const res = await fetch(url, init(o));
  if (!res.ok) throw new Error(`efetch ${res.status}`);
  return res.text();
}

export async function esearch(term: string, o: FetchOpts = {}): Promise<string[]> {
  const data = (await getJson(searchUrl(term, o.retmax ?? 40, o.apiKey ?? ""), o)) as {
    esearchresult?: { idlist?: string[] };
  };
  return data.esearchresult?.idlist ?? [];
}

export async function efetch(pmids: string[], o: FetchOpts = {}): Promise<ParsedArticle[]> {
  if (!pmids.length) return [];
  return parseArticles(await getText(fetchUrl(pmids, o.apiKey ?? ""), o));
}

export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
export const doiUrl = (doi: string | null) => (doi ? `https://doi.org/${doi}` : "");
