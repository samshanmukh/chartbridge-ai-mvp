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
    "med-stale": "Confirm the patient is still taking this medication and document current status; renew, adjust, or discontinue as appropriate.",
    beers: "Switch the nightly first-generation antihistamine to a second-generation agent and address the underlying sleep complaint directly.",
    screening: "Order age-appropriate screening labs (lipid panel, metabolic panel, A1c) and reconcile any results obtained at outside facilities.",
    perioperative: "Confirm the latex-free allergy banner propagates to every clinic and hospital before any future procedure.",
    wearable: "Refer for a sleep study — overnight oxygen desaturations with fragmented sleep suggest undiagnosed sleep-disordered breathing.",
    reconcile: "Reconcile the conflicting records and update the structured chart to match.",
  };

  const recentLabs = [...b.labs]
    .filter((l) => l.effective)
    .sort((a, c) => new Date(c.effective!).getTime() - new Date(a.effective!).getTime())
    .slice(0, 6);

  const clinician: ReportSectionDTO[] = [
    {
      title: "Clinical Summary",
      content: `${d.name}, ${d.age ?? "?"}${sexInitial(d.gender)}. Active problems: ${activeProblems.map((p) => p.text).join(", ") || "none recorded"}. Currently on ${active.length} active medication(s): ${active.map((m) => m.text).join(", ") || "none"}. ChartBridge reconciled ${b.problems.length} conditions, ${b.medications.length} medications, ${b.labs.length} labs, ${b.allergies.length} allergies, and ${b.vitals.length} wearable signals with ${citations.length} clinic correspondence records — surfacing ${gaps.length} reconciliation gap(s), ${high.length} high-priority.`,
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
      content:
        gaps.map((g, i) => `${i + 1}. ${g.title} (${g.severity}) — ${g.detail}`).join("\n") ||
        "No active reconciliation concerns detected.",
    },
    {
      title: "Medication Reconciliation",
      flag: gaps.some((g) => g.kind === "med-stale" || g.kind === "beers"),
      content: [
        ...active.map((m) => `${m.text} — ACTIVE since ${m.authoredOn?.slice(0, 10) ?? "unknown"}; no recent refill or review on record.`),
        crmCite("crm-pharmacy-fax")
          ? `Pharmacy correspondence flags long-term OTC antihistamine use for prescriber review [${crmCite("crm-pharmacy-fax")!.source}].`
          : "",
      ].filter(Boolean).join("\n"),
    },
    {
      title: "Notable Labs",
      content: recentLabs.length
        ? recentLabs.map((l) => `${l.text}: ${l.value ?? "?"}${l.flag && l.flag !== "normal" ? ` [${l.flag}]` : ""} (${l.effective?.slice(0, 10)})`).join("\n") +
          (gaps.some((g) => g.kind === "screening") ? "\nMost recent panel is several years old — routine screening appears overdue." : "")
        : "No laboratory results on file.",
    },
    {
      title: "Wearable Signals",
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
  const system = `You are a clinical documentation assistant for ChartBridge AI. Reconcile the fragmented patient data into TWO reports. GROUND every statement strictly in the data provided — never invent labs, medications, diagnoses, or dates. When a clinic CRM record supports a point, cite it inline like [source name].

Return STRICT JSON: {"clinician":[{"title":string,"content":string,"flag":boolean}],"patient":[{"title":string,"content":string,"flag":boolean}]}.

CLINICIAN BRIEF — detailed but organized and scannable. Write in complete sentences with clinical reasoning, but keep each item focused (1-2 sentences). Use \\n between items. Clinician sections, in this exact order:
- "Clinical Summary": 3-4 sentences — demographics, key active problems, relevant history, and the headline reconciliation finding.
- "Priority Actions": 4-6 recommendations, each STARTING WITH AN IMPERATIVE VERB (Order…, Refer…, Reassess…, Confirm…, Document…, Switch…) followed by a brief rationale (e.g. "Refer for a sleep study — overnight SpO2 dips below 90% with reported snoring suggest undiagnosed OSA."). This is the most important section.
- "Active Concerns": one item per concern, highest severity first, each with a short explanation of why it matters.
- "Medication Reconciliation": each active medication with status, how long it has been active, and any reconciliation issue.
- "Notable Labs": the most relevant results with values, flags, and dates; note if screening is overdue.
- "Wearable Signals": reconcile the patient-connected Apple Health data against the chart and call out anything (e.g. overnight oxygen desaturations) that appears in no clinical source.
- "Care Gaps": one item per gap with why it matters.
- "Questions to Clarify at Next Visit": specific questions tied to the gaps.
Set flag=true on Priority Actions, Active Concerns, Medication Reconciliation, Wearable Signals, and Care Gaps.

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
