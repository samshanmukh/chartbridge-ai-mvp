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

  const actionFor: Record<string, string> = {
    "med-stale": "Confirm still taking; renew, adjust, or discontinue.",
    beers: "Switch to a second-generation antihistamine; address sleep.",
    screening: "Order overdue screening labs (lipids, A1c, vitamin D).",
    perioperative: "Flag latex-free across every care setting.",
    wearable: "Refer for a sleep study — overnight oxygen dips.",
    reconcile: "Reconcile the conflicting records in the chart.",
  };

  const clinician: ReportSectionDTO[] = [
    {
      title: "Clinical Summary",
      content: `${d.name}, ${d.age ?? "?"}${sexInitial(d.gender)}.\nActive: ${activeProblems.slice(0, 3).map((p) => p.text).join(", ") || "none recorded"}.\n${gaps.length} reconciliation gap(s) across ${b.medications.length} meds, ${b.labs.length} labs, ${b.allergies.length} allergies.`,
    },
    {
      title: "Priority Actions",
      flag: true,
      content:
        gaps.map((g) => actionFor[g.kind] ?? `Address: ${g.title}.`).join("\n") ||
        "No immediate actions required.",
    },
    {
      title: "Active Concerns",
      flag: gaps.length > 0,
      content: gaps.map((g) => `${g.title} (${g.severity})`).join("\n") || "None.",
    },
    {
      title: "Care Gaps",
      flag: high.length > 0,
      content:
        (high.length ? high : gaps).map((g) => g.title).join("\n") || "None.",
    },
    {
      title: "Questions to Clarify at Next Visit",
      content: gaps.map((g) => g.question).join("\n") || "None.",
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
  const system = `You are a clinical documentation assistant for ChartBridge AI. Reconcile the fragmented patient data into TWO reports. GROUND every statement strictly in the data provided — never invent labs, medications, diagnoses, or dates. When a clinic CRM record supports a point, cite it inline like [source name].

Return STRICT JSON: {"clinician":[{"title":string,"content":string,"flag":boolean}],"patient":[{"title":string,"content":string,"flag":boolean}]}.

CLINICIAN BRIEF — be SHORT and SCANNABLE. Every line is ONE fact or ONE action, max ~12 words. NO paragraphs, no filler. Use \\n between lines (no bullet characters). Clinician sections, in this exact order:
- "Clinical Summary": 1-2 short lines — who the patient is and the headline issue.
- "Priority Actions": 3-5 concrete recommendations, each STARTING WITH AN IMPERATIVE VERB (Order…, Refer…, Reassess…, Confirm…, Document…, Switch…). This is the most important section — make it specific and actionable.
- "Active Concerns": terse one-line items, highest severity first.
- "Care Gaps": terse one-line items.
- "Questions to Clarify at Next Visit": terse one-line questions.
Set flag=true on Priority Actions, Active Concerns, and Care Gaps.

PATIENT SUMMARY sections, in order: What We Found, What to Ask Your Doctor, Next Steps. Warm, plain English, short lines (6th-grade reading level).`;
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
