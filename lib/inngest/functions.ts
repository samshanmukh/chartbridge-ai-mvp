// Autonomous patient-data pipeline. Each stage is a retriable, memoized
// Inngest step; FHIR fetch happens first, then CRM indexing and retrieval run
// in parallel, then Grok synthesizes the report. Watch it run step-by-step in
// the Inngest Dev UI (http://localhost:8288).
import { inngest } from "./client";
import { getBundleWithFallback } from "@/lib/fhir";
import { detectGaps } from "@/lib/derive";
import { indexCrm, retrieveCrm } from "@/lib/vector";
import { generateReport } from "@/lib/report";
import { DEFAULT_PATIENT_ID } from "@/lib/config";

export const patientPipeline = inngest.createFunction(
  {
    id: "patient-data-pipeline",
    retries: 2,
    triggers: [{ event: "patient/pipeline.requested" }],
  },
  async ({ event, step }) => {
    const patientId: string = event.data?.patientId || DEFAULT_PATIENT_ID;

    // Stage 1 — pull and normalize the live FHIR record.
    const { bundle, live } = await step.run("fetch-fhir", () =>
      getBundleWithFallback(patientId)
    );

    // Stage 2 — deterministic gap detection (no external calls).
    const gaps = await step.run("detect-gaps", async () => detectGaps(bundle));

    const query = [
      "medication reconciliation, allergies, care gaps, follow-up,",
      gaps.map((g) => g.title).join(", "),
    ].join(" ");

    // Stage 3 — fan out: index the CRM corpus and retrieve citations in parallel.
    const [crmIndex, retrieval] = await Promise.all([
      step.run("index-crm", () => indexCrm(bundle)),
      step.run("retrieve-crm", () => retrieveCrm(bundle, query, 4)),
    ]);

    // Stage 4 — Grok synthesizes the grounded dual report.
    const report = await step.run("generate-report", () =>
      generateReport(bundle, gaps, retrieval.citations)
    );

    // Stage 5 — synthesize a compact run summary.
    return step.run("synthesize", async () => ({
      patientId,
      patientName: bundle.demographics.name,
      live,
      gapsFound: gaps.length,
      crmIndexed: crmIndex.indexed,
      crmMode: retrieval.mode,
      reportSource: report.source,
      clinicianSections: report.clinician.length,
      patientSections: report.patient.length,
    }));
  }
);
