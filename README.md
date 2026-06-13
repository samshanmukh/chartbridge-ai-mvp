# ChartBridge AI

Turn fragmented patient records into one reconciled care story. ChartBridge pulls a
patient's **live FHIR** record, detects reconciliation gaps no single source reveals,
runs **RAG over the clinic's unstructured records** (faxes, referral letters, call
notes), and uses **Grok** to generate clinician-ready and patient-friendly reports.

Built for the Autonomous Healthcare Hackathon (xAI · Vercel · Inngest). Theme:
patient agency. UI bootstrapped with [v0](https://v0.app); live data layer + AI added on top.

## How it works

```
Live FHIR (SMART sandbox)  ─┐
Detected care gaps         ─┼─►  Grok report (clinician + patient)
Clinic CRM corpus (RAG)    ─┘        grounded + source-cited
```

- **FHIR** — zero-auth SMART Health IT launcher; a real Synthea patient (Marsha Hayes)
  normalized into one bundle. [lib/fhir.ts](lib/fhir.ts), [app/api/patient/route.ts](app/api/patient/route.ts)
- **Gap detection** — deterministic, data-driven (stale meds, Beers-criteria flags,
  overdue screening, latex-allergy-plus-surgery). [lib/derive.ts](lib/derive.ts)
- **Patient CRM + RAG** — synthetic-but-coherent unstructured records, retrieved via
  turbopuffer (+ OpenAI embeddings), with OpenAI-in-memory and lexical fallbacks.
  [lib/crm.ts](lib/crm.ts), [lib/vector.ts](lib/vector.ts)
- **Reports** — Grok `grok-4.3` generates the dual report; a deterministic engine is
  the fallback. [lib/report.ts](lib/report.ts), [app/api/report/route.ts](app/api/report/route.ts)
- **Autonomous pipeline** — Inngest fans out FHIR fetch + CRM indexing + Grok report as
  retriable steps. [lib/inngest/functions.ts](lib/inngest/functions.ts)

**Graceful degradation:** with no API keys the app still runs end-to-end on live FHIR
with a deterministic report and lexical RAG. Keys upgrade it to real Grok + turbopuffer.

## Run locally

```bash
pnpm install
cp .env.local.example .env.local   # all keys optional — see the file
pnpm dev                           # http://localhost:3000
```

Optional — watch the autonomous pipeline step-by-step:

```bash
npx inngest-cli@latest dev         # Dev UI at http://localhost:8288
# then: curl -X POST localhost:3000/api/pipeline
```

## Environment

See [.env.local.example](.env.local.example). Summary: `XAI_API_KEY` enables Grok
report generation; `OPENAI_API_KEY` (+ `TURBOPUFFER_API_KEY`, `TURBOPUFFER_REGION`)
enable real vector RAG. FHIR needs no key.

> Synthetic data only. Not a medical device; does not diagnose, treat, or replace clinical judgment.
