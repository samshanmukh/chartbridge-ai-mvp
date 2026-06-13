// xAI Collections adapter — a real, hosted vector DB for the clinic-CRM corpus.
// Create a collection (management API), upload each CRM doc + add it to the
// collection, then semantic/hybrid search at query time. xAI generates the
// embeddings server-side, so this needs only the Grok keys (no OpenAI).
//
// Auth split:
//   • management-api.x.ai  (XAI_MANAGEMENT_API_KEY) — create collection, add docs
//   • api.x.ai             (XAI_API_KEY)            — upload files, search
import "server-only";
import type { CrmDoc, Citation, PatientBundle } from "./types";
import { seedCrmDocs } from "./crm";

const MGMT_BASE = "https://management-api.x.ai/v1";
const API_BASE = "https://api.x.ai/v1";

const mgmtKey = () => process.env.XAI_MANAGEMENT_API_KEY ?? "";
const apiKey = () => process.env.XAI_API_KEY ?? "";

async function jsonOrText(res: Response): Promise<unknown> {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

// Pull an id out of a response whatever the field name turns out to be.
function pluckId(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  // sometimes nested under `collection` / `file` / `data`
  for (const wrap of ["collection", "file", "document", "data"]) {
    if (o[wrap] && typeof o[wrap] === "object") {
      const inner = pluckId(o[wrap], ...keys);
      if (inner) return inner;
    }
  }
  return undefined;
}

export async function createCollection(name: string): Promise<{ id?: string; raw: unknown; ok: boolean }> {
  const res = await fetch(`${MGMT_BASE}/collections`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mgmtKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ collection_name: name, name }),
  });
  const raw = await jsonOrText(res);
  return { id: pluckId(raw, "collection_id", "id"), raw, ok: res.ok };
}

async function uploadFile(name: string, text: string): Promise<{ id?: string; raw: unknown; ok: boolean }> {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/plain" }), `${name}.txt`);
  form.append("purpose", "assistants");
  const res = await fetch(`${API_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  const raw = await jsonOrText(res);
  return { id: pluckId(raw, "file_id", "id"), raw, ok: res.ok };
}

async function addToCollection(
  collectionId: string,
  fileId: string,
  fields: Record<string, string>
): Promise<{ raw: unknown; ok: boolean }> {
  const res = await fetch(`${MGMT_BASE}/collections/${collectionId}/documents/${fileId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mgmtKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return { raw: await jsonOrText(res), ok: res.ok };
}

// Upload one CRM doc and link it into the collection, keeping our app-level id
// + metadata in the document's fields so search results map back to a Citation.
async function indexDoc(collectionId: string, d: CrmDoc): Promise<{ id: string; ok: boolean; raw: unknown }> {
  const text = `${d.title}\n\n${d.body}`;
  const up = await uploadFile(d.id, text);
  if (!up.ok || !up.id) return { id: d.id, ok: false, raw: up.raw };
  const link = await addToCollection(collectionId, up.id, {
    crmId: d.id,
    docType: d.docType,
    date: d.date,
    source: d.source,
    title: d.title,
  });
  return { id: d.id, ok: link.ok, raw: link.raw };
}

export interface SeedResult {
  collectionId?: string;
  createRaw: unknown;
  uploaded: { id: string; ok: boolean }[];
}

// One-time (idempotent-ish) seed: build Sam's CRM corpus and push it to a fresh
// collection. Returns the collection id to put in XAI_COLLECTION_ID.
export async function seedCollection(bundle: PatientBundle, collectionId?: string): Promise<SeedResult> {
  const docs = seedCrmDocs(bundle);
  let cid = collectionId || process.env.XAI_COLLECTION_ID;
  let createRaw: unknown = { reused: cid ?? null };
  if (!cid) {
    const created = await createCollection(`chartbridge-${bundle.demographics.id}`);
    createRaw = created.raw;
    cid = created.id;
    if (!cid) return { collectionId: undefined, createRaw, uploaded: [] };
  }
  const uploaded: { id: string; ok: boolean }[] = [];
  for (const d of docs) {
    const r = await indexDoc(cid, d);
    uploaded.push({ id: r.id, ok: r.ok });
    if (!r.ok) console.warn("[xai-collections] index failed for", d.id, r.raw);
  }
  return { collectionId: cid, createRaw, uploaded };
}

// xAI returns the chunk text as a JSON string: [{"page_number":0,"text":"..."}].
function decodeChunk(content: unknown): string {
  if (typeof content !== "string") return "";
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => (p && typeof p.text === "string" ? p.text : "")).join(" ").trim();
    }
  } catch {
    /* not JSON — use as-is */
  }
  return content;
}

// Normalize the search response (`matches[]`) into Citations. Hybrid retrieval
// returns each chunk twice (semantic + keyword lists), so we dedup by id keeping
// the highest score, sort, and take topK.
function rowsToCitations(raw: unknown, topK: number): Citation[] {
  const o = raw as Record<string, unknown>;
  const arr =
    (Array.isArray(o?.matches) && o.matches) ||
    (Array.isArray(o?.results) && o.results) ||
    (Array.isArray(o?.documents) && o.documents) ||
    (Array.isArray(raw) && (raw as unknown[])) ||
    [];
  const byId = new Map<string, Citation>();
  (arr as Record<string, unknown>[]).forEach((r, i) => {
    const fields = (r.fields ?? r.metadata ?? {}) as Record<string, unknown>;
    const fstr = (...keys: string[]): string => {
      for (const k of keys) if (typeof fields[k] === "string" && fields[k]) return fields[k] as string;
      return "";
    };
    const score = typeof r.score === "number" ? Math.round(r.score * 1000) / 1000 : undefined;
    const id = fstr("crmId") || String(r.file_id ?? `xai-${i}`);
    const existing = byId.get(id);
    if (existing && (existing.score ?? 0) >= (score ?? 0)) return;
    byId.set(id, {
      id,
      chunkText: decodeChunk(r.chunk_content ?? r.chunkContent ?? r.text),
      docType: (fstr("docType") || "note") as Citation["docType"],
      date: fstr("date"),
      source: fstr("source") || fstr("title"),
      score,
    });
  });
  return [...byId.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topK);
}

export async function searchCollection(
  collectionId: string,
  query: string,
  topK = 4
): Promise<{ citations: Citation[]; raw: unknown; ok: boolean }> {
  const res = await fetch(`${API_BASE}/documents/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      source: { collection_ids: [collectionId] },
      retrieval_mode: { type: "hybrid" },
      // over-fetch: hybrid returns dupes (semantic + keyword) we collapse later.
      limit: topK * 3,
      top_k: topK * 3,
    }),
  });
  const raw = await jsonOrText(res);
  return { citations: res.ok ? rowsToCitations(raw, topK) : [], raw, ok: res.ok };
}
