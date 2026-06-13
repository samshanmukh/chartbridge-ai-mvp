// Retrieval over the patient-CRM corpus, with graceful tiers:
//   1. turbopuffer + OpenAI embeddings   (real vector DB; when creds present)
//   2. OpenAI embeddings, in-memory cosine (when only OPENAI_API_KEY present)
//   3. lexical token-overlap              (zero keys — demo always works)
import "server-only";
import OpenAI from "openai";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMS,
  hasOpenAI,
  hasTurbopuffer,
  hasXaiCollections,
  XAI_COLLECTION_ID,
} from "./config";
import { seedCrmDocs } from "./crm";
import { searchCollection } from "./xai-collections";
import type { PatientBundle, CrmDoc, Citation } from "./types";

let openai: OpenAI | null = null;
function oa(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

async function embed(texts: string[]): Promise<number[][]> {
  const res = await oa().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMS,
  });
  return res.data.map((d) => d.embedding);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2);
}

// Overlap normalized by doc length; rough but effective for short CRM notes.
function lexicalScore(query: string, doc: string): number {
  const qs = new Set(tokens(query));
  const ds = tokens(doc);
  if (!ds.length) return 0;
  let hits = 0;
  for (const t of ds) if (qs.has(t)) hits++;
  return hits / Math.sqrt(ds.length);
}

const chunkOf = (d: CrmDoc) => `${d.title}. ${d.body}`;

function toCitations(
  scored: { d: CrmDoc; score: number }[],
  topK: number
): Citation[] {
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ d, score }) => ({
      id: d.id,
      chunkText: d.body,
      docType: d.docType,
      date: d.date,
      source: d.source,
      score: Math.round(score * 1000) / 1000,
    }));
}

export interface RetrieveResult {
  citations: Citation[];
  mode: "xai-collections" | "turbopuffer" | "openai-memory" | "lexical";
}

export async function retrieveCrm(
  bundle: PatientBundle,
  query: string,
  topK = 4
): Promise<RetrieveResult> {
  const docs = seedCrmDocs(bundle);

  // Tier 0 — xAI Collections (hosted vector DB; embeddings done by xAI).
  if (hasXaiCollections()) {
    try {
      const { citations, ok } = await searchCollection(XAI_COLLECTION_ID, query, topK);
      if (ok && citations.length) return { citations, mode: "xai-collections" };
      console.warn("[vector] xai-collections returned no rows, falling back");
    } catch (e) {
      console.warn("[vector] xai-collections failed, falling back:", e);
    }
  }

  if (hasTurbopuffer() && hasOpenAI()) {
    try {
      const citations = await tpufUpsertAndQuery(
        bundle.demographics.id,
        docs,
        query,
        topK
      );
      return { citations, mode: "turbopuffer" };
    } catch (e) {
      console.warn("[vector] turbopuffer failed, falling back:", e);
    }
  }

  if (hasOpenAI()) {
    try {
      const vecs = await embed([query, ...docs.map(chunkOf)]);
      const qv = vecs[0];
      const scored = docs.map((d, i) => ({ d, score: cosine(qv, vecs[i + 1]) }));
      return { citations: toCitations(scored, topK), mode: "openai-memory" };
    } catch (e) {
      console.warn("[vector] OpenAI embeddings failed, lexical fallback:", e);
    }
  }

  const scored = docs.map((d) => ({ d, score: lexicalScore(query, chunkOf(d)) }));
  return { citations: toCitations(scored, topK), mode: "lexical" };
}

// ----- turbopuffer adapter (active only when creds are set) -----
async function getNamespace(patientId: string) {
  const { Turbopuffer } = await import("@turbopuffer/turbopuffer");
  const tpuf = new Turbopuffer({
    apiKey: process.env.TURBOPUFFER_API_KEY!,
    region: process.env.TURBOPUFFER_REGION!,
  });
  return tpuf.namespace(`patient_${patientId}`);
}

async function tpufUpsert(patientId: string, docs: CrmDoc[]): Promise<void> {
  const ns = await getNamespace(patientId);
  const vectors = await embed(docs.map(chunkOf));
  await ns.write({
    upsert_rows: docs.map((d, i) => ({
      id: d.id,
      vector: vectors[i],
      patientId,
      docType: d.docType,
      date: d.date,
      source: d.source,
      chunkText: d.body,
    })),
    distance_metric: "cosine_distance",
    schema: {
      chunkText: { type: "string", full_text_search: true },
    },
  } as never);
}

async function tpufUpsertAndQuery(
  patientId: string,
  docs: CrmDoc[],
  query: string,
  topK: number
): Promise<Citation[]> {
  await tpufUpsert(patientId, docs);
  const ns = await getNamespace(patientId);
  const [qv] = await embed([query]);
  const res = (await ns.query({
    rank_by: ["vector", "ANN", qv],
    top_k: topK,
    include_attributes: ["chunkText", "docType", "date", "source"],
  } as never)) as { rows?: Record<string, unknown>[] };
  return (res.rows ?? []).map((r) => ({
    id: String(r.id),
    chunkText: String(r.chunkText ?? ""),
    docType: r.docType as Citation["docType"],
    date: String(r.date ?? ""),
    source: String(r.source ?? ""),
    score: typeof r.$dist === "number" ? r.$dist : undefined,
  }));
}

// Used by the Inngest pipeline as a dedicated indexing step.
export async function indexCrm(
  bundle: PatientBundle
): Promise<{ indexed: number; mode: string }> {
  const docs = seedCrmDocs(bundle);
  if (hasTurbopuffer() && hasOpenAI()) {
    try {
      await tpufUpsert(bundle.demographics.id, docs);
      return { indexed: docs.length, mode: "turbopuffer" };
    } catch (e) {
      console.warn("[vector] index via turbopuffer failed:", e);
    }
  }
  return {
    indexed: docs.length,
    mode: hasOpenAI() ? "openai-memory" : "lexical",
  };
}
