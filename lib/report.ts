// Dual-report generation (clinician + patient) grounded in the real FHIR
// bundle, detected gaps, and retrieved CRM citations. Uses Grok when available;
// otherwise a deterministic builder produces a genuinely useful report from the
// same real data, so the panel works with zero keys.
import "server-only";
import { grokJSON } from "./grok";
import type {
  PatientBundle,
  Gap,
  Citation,
  ReportSectionDTO,
} from "./types";

export interface ReportPayload {
  clinician: ReportSectionDTO[];
  patient: ReportSectionDTO[];
  citations: Citation[];
  source: "grok" | "fallback";
}

function sexInitial(g?: string): string {
  return g ? g[0].toUpperCase() : "";
}

function buildContext(
  b: PatientBundle,
  gaps: Gap[],
  citations: Citation[]
): string {
  const d = b.demographics;
  const active = b.medications.filter((m) => m.status === "active");
  const stopped = b.medications.filter((m) => m.status === "stopped");
  const activeProblems = b.problems.filter((p) => p.status === "active");
  const recentLabs = [...b.labs]
    .filter((l) => l.effective)
    .sort(
      (a, c) =>
        new Date(c.effective!).getTime() - new Date(a.effective!).getTime()
    )
    .slice(0, 8);

  return [
    `PATIENT: ${d.name}, ${d.age ?? "?"}${sexInitial(d.gender)} (DOB ${d.birthDate ?? "?"}).`,
    `ACTIVE PROBLEMS: ${activeProblems.map((p) => p.text).join("; ") || "none recorded"}.`,
    `ACTIVE MEDICATIONS: ${active.map((m) => `${m.text} (since ${m.authoredOn?.slice(0, 10) ?? "?"})`).join("; ") || "none"}.`,
    `STOPPED MEDICATIONS: ${stopped.map((m) => m.text).join("; ") || "none"}.`,
    `RECENT LABS: ${recentLabs.map((l) => `${l.text}=${l.value ?? "?"}${l.flag && l.flag !== "normal" ? ` [${l.flag}]` : ""} (${l.effective?.slice(0, 10)})`).join("; ") || "none"}.`,
    `PATIENT-CONNECTED WEARABLE (Apple Health, real): ${b.vitals.map((v) => `${v.text}=${v.value ?? "?"}`).join("; ") || "none"}.`,
    `ALLERGIES: ${b.allergies.map((a) => `${a.substance}${a.criticality ? ` (${a.criticality})` : ""}`).join("; ") || "none"}.`,
    `IMMUNIZATIONS ON FILE: ${b.immunizations.length}.`,
    ``,
    `DETECTED GAPS:`,
    ...gaps.map(
      (g, i) => `${i + 1}. [${g.severity}] ${g.title} — ${g.detail}`
    ),
    ``,
    `CLINIC CRM RECORDS (unstructured, retrieved for this patient):`,
    ...citations.map(
      (c) => `- [${c.source}] (${c.docType}, ${c.date}): ${c.chunkText}`
    ),
  ].join("\n");
}

function buildFallback(
  b: PatientBundle,
  gaps: Gap[],
  citations: Citation[]
): { clinician: ReportSectionDTO[]; patient: ReportSectionDTO[] } {
  const d = b.demographics;
  const active = b.medications.filter((m) => m.status === "active");
  const activeProblems = b.problems.filter((p) => p.status === "active");
  const high = gaps.filter((g) => g.severity === "high");
  const lastLab = [...b.labs]
    .filter((l) => l.effective)
    .sort(
      (a, c) =>
        new Date(c.effective!).getTime() - new Date(a.effective!).getTime()
    )[0];
  const crmCite = (id: string) => citations.find((c) => c.id === id);

  const clinician: ReportSectionDTO[] = [
    {
      title: "Clinical Summary",
      content: `${d.name}, ${d.age ?? "?"}${sexInitial(d.gender)}. Active problems: ${activeProblems.map((p) => p.text).join(", ") || "none recorded"}. Currently on ${active.length} active medication(s): ${active.map((m) => m.text).join(", ") || "none"}. ChartBridge reconciled ${b.problems.length} conditions, ${b.medications.length} medications, ${b.labs.length} labs, and ${b.allergies.length} allergies from FHIR with ${citations.length} clinic correspondence records, surfacing ${gaps.length} reconciliation gap(s).`,
    },
    {
      title: "Active Concerns",
      flag: gaps.length > 0,
      content:
        gaps
          .map((g, i) => `${i + 1}. ${g.title} (${g.severity})`)
          .join("\n") || "No active reconciliation concerns detected.",
    },
    {
      title: "Medication Reconciliation",
      flag: gaps.some((g) => g.kind === "med-stale" || g.kind === "beers"),
      content: [
        ...active.map(
          (m) =>
            `${m.text} — ACTIVE (authored ${m.authoredOn?.slice(0, 10) ?? "unknown"})`
        ),
        crmCite("crm-pharmacy-fax")
          ? `Pharmacy correspondence on file flags long-term OTC antihistamine use for prescriber review [${crmCite("crm-pharmacy-fax")!.source}].`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      title: "Notable Labs",
      content: lastLab
        ? `Most recent result on file: ${lastLab.text} = ${lastLab.value} (${lastLab.effective?.slice(0, 10)}). ${gaps.some((g) => g.kind === "screening") ? "Routine screening labs appear overdue — see Care Gaps." : ""}`
        : "No laboratory results on file.",
    },
    {
      title: "Wearable Signals (patient-connected)",
      flag: gaps.some((g) => g.kind === "wearable"),
      content:
        b.vitals.map((v) => `${v.text}: ${v.value}`).join("\n") ||
        "No patient-connected wearable data.",
    },
    {
      title: "Care Gaps",
      flag: high.length > 0,
      content:
        gaps.map((g, i) => `${i + 1}. ${g.detail}`).join("\n") ||
        "No care gaps detected.",
    },
    {
      title: "Questions to Clarify at Next Visit",
      content:
        gaps.map((g, i) => `${i + 1}. ${g.question}`).join("\n") ||
        "No outstanding clarifications.",
    },
  ];

  const patient: ReportSectionDTO[] = [
    {
      title: "What We Found",
      content: `We pulled together your records from several places — your clinic's chart, your lab results, your medication list, and letters and calls about your care. Here's the picture: you have ${activeProblems.length} ongoing health item(s) on file and ${active.length} medication(s) you're currently taking. We found ${gaps.length} thing(s) worth double-checking with your doctor.`,
    },
    {
      title: "What to Ask Your Doctor",
      flag: true,
      content:
        gaps
          .slice(0, 4)
          .map((g, i) => `${i + 1}. ${g.question}`)
          .join("\n") || "Your records look up to date.",
    },
    {
      title: "Next Steps",
      content: `Your care team can review this summary before your next visit. If any of the items above are still open, bringing them up directly will help make sure nothing falls through the cracks across the different places you get care.`,
    },
    {
      title: "Things Not to Ignore",
      flag: high.length > 0,
      content:
        high.map((g) => `• ${g.title}: ${g.detail}`).join("\n") ||
        "Nothing urgent was flagged, but keep your routine check-ups on schedule.",
    },
  ];

  return { clinician, patient };
}

export async function generateReport(
  b: PatientBundle,
  gaps: Gap[],
  citations: Citation[]
): Promise<ReportPayload> {
  const fallback = buildFallback(b, gaps, citations);
  const system = `You are a clinical documentation assistant for ChartBridge AI. You reconcile fragmented patient data into TWO reports: a clinician brief and a plain-English patient summary. GROUND every statement strictly in the data provided — never invent labs, medications, diagnoses, or dates. When a statement is supported by a clinic CRM record, cite it inline like [source name]. Return STRICT JSON of the form {"clinician":[{"title":string,"content":string,"flag":boolean}],"patient":[{"title":string,"content":string,"flag":boolean}]}. Clinician sections, in order: Clinical Summary, Active Concerns, Medication Reconciliation, Notable Labs, Wearable Signals (patient-connected), Care Gaps, Questions to Clarify at Next Visit. The Wearable Signals section must reconcile the patient-connected Apple Health data against the chart and call out anything (e.g. overnight oxygen desaturations) that appears in no clinical source. Patient sections, in order: What We Found, What Changed, What to Ask Your Doctor, Next Steps. Use \\n between list items. Set flag=true on sections that need clinician attention. Patient sections must be warm, clear, and 6th-grade reading level.`;
  const user = buildContext(b, gaps, citations);
  const { value, source } = await grokJSON<{
    clinician: ReportSectionDTO[];
    patient: ReportSectionDTO[];
  }>(system, user, fallback);

  return {
    clinician: value.clinician ?? fallback.clinician,
    patient: value.patient ?? fallback.patient,
    citations,
    source,
  };
}
