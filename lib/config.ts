// Central config + capability flags. Everything degrades gracefully when a
// given API key is absent, so the app runs end-to-end on live FHIR alone.

export const FHIR_BASE =
  process.env.FHIR_BASE_URL || "https://launch.smarthealthit.org/v/r4/fhir";

// Verified live Synthea patient on the SMART Health IT launcher ("Marsha Hayes").
// Re-verify the morning of the demo; the launcher data set can be re-seeded.
export const DEFAULT_PATIENT_ID =
  process.env.DEFAULT_PATIENT_ID || "5fbee500-9b99-4dad-bce4-0a4de9f9f3b9";

// xAI Grok (OpenAI-compatible). grok-4.3 is the June 2026 flagship chat model.
export const XAI_BASE_URL = "https://api.x.ai/v1";
export const GROK_MODEL = process.env.GROK_MODEL || "grok-4.3";

// Embeddings: xAI has no public embeddings endpoint, so we use OpenAI.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

// Capability flags — read at request time on the server.
export const hasGrok = () => !!process.env.XAI_API_KEY;
export const hasOpenAI = () => !!process.env.OPENAI_API_KEY;
export const hasTurbopuffer = () =>
  !!process.env.TURBOPUFFER_API_KEY && !!process.env.TURBOPUFFER_REGION;
export const hasUpstash = () =>
  !!process.env.UPSTASH_VECTOR_REST_URL && !!process.env.UPSTASH_VECTOR_REST_TOKEN;

// xAI Collections — hosted vector DB for the clinic-CRM corpus (embeddings done
// server-side by xAI). Needs the management key to seed and a collection id to
// query. XAI_COLLECTION_ID is produced by POST /api/collections/seed.
export const XAI_COLLECTION_ID = process.env.XAI_COLLECTION_ID || "";
export const hasXaiCollections = () =>
  !!process.env.XAI_API_KEY && !!XAI_COLLECTION_ID;
