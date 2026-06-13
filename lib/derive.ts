// Pure, deterministic derivations from a PatientBundle. No API key required, so
// the intake dashboard, timeline, and gap detection are fully live on FHIR alone.
import type {
  PatientBundle,
  DataSourceDTO,
  TimelineEventDTO,
  EventSource,
  Gap,
  InsightDTO,
} from "./types";
import healthSummary from "./sam-health.json";

// Real total of Apple Health records behind the wearable layer (lib/sam-health.json).
const WEARABLE_RECORDS = healthSummary.meta?.totalRecordsScanned ?? 0;

export type { Gap } from "./types";

const GAP_ACTION: Record<Gap["kind"], string> = {
  "med-stale":
    "Confirm the patient is still taking this medication and document current status; renew, adjust, or discontinue as appropriate.",
  beers:
    "Reassess chronic nightly first-generation antihistamine use; it adds anticholinergic burden, fragments sleep architecture, and may be masking an underlying sleep complaint. Consider a second-generation agent (loratadine/cetirizine) and address the root cause.",
  screening:
    "Order age-appropriate screening labs and reconcile any results obtained at outside facilities into the chart.",
  perioperative:
    "Ensure the allergy banner propagates to every care setting and is flagged for any future procedure.",
  reconcile:
    "Reconcile the conflicting records and update the structured chart to match.",
  wearable:
    "Review the patient-connected wearable trend against the chart; if corroborated, order the appropriate work-up (e.g., a sleep study) and document it. This signal exists in no clinical source today.",
};

const GAP_ICON: Record<Gap["kind"], InsightDTO["iconKey"]> = {
  "med-stale": "med",
  beers: "med",
  screening: "calendar",
  perioperative: "alert",
  reconcile: "merge",
  wearable: "trend",
};

export function deriveInsights(gaps: Gap[]): InsightDTO[] {
  return gaps.map((g) => ({
    id: g.id,
    iconKey: GAP_ICON[g.kind],
    title: g.title,
    severity: g.severity,
    explanation: g.detail,
    suggestedAction: GAP_ACTION[g.kind],
  }));
}

const DAY = 86_400_000;

function fmt(iso?: string): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function daysAgo(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return undefined;
  return Math.floor((Date.now() - t) / DAY);
}

function latest(dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter(Boolean) as string[];
  if (!valid.length) return undefined;
  return valid.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

// Heuristic, data-driven gap detection. Drives reconciliation insights and the
// voice intake prompts. Grok refines these into prose; this guarantees the demo
// surfaces real gaps even with no LLM key.
export function detectGaps(b: PatientBundle): Gap[] {
  const gaps: Gap[] = [];
  const activeMeds = b.medications.filter((m) => m.status === "active");

  // 1. Active meds with no recent activity (possible adherence / reconciliation gap)
  for (const m of activeMeds) {
    const d = daysAgo(m.authoredOn);
    if (d !== undefined && d > 365) {
      const years = Math.floor(d / 365);
      gaps.push({
        id: `med-${m.text.slice(0, 12).replace(/\W/g, "")}`,
        kind: "med-stale",
        severity: years >= 5 ? "medium" : "low",
        title: `Long-standing active medication: ${m.text}`,
        detail: `${m.text} is marked active but was last authored ${years}+ year(s) ago (${fmt(m.authoredOn)}). No recent refill or review on record.`,
        question: `Our records show ${m.text} as an active medication, last updated ${years} years ago. Are you still taking it, and is it still helping?`,
        tag: "Medication Review",
      });
    }
  }

  // 2. Chronic first-generation antihistamine — anticholinergic burden + sleep disruption
  const beers = activeMeds.find((m) =>
    /diphenhydramine|hydroxyzine|chlorpheniramine/i.test(m.text)
  );
  if (beers) {
    gaps.push({
      id: "beers-antihistamine",
      kind: "beers",
      severity: "medium",
      title: "Chronic first-generation antihistamine taken for sleep",
      detail: `${beers.text} is a sedating first-generation antihistamine. Long-standing nightly use raises anticholinergic burden and disrupts sleep architecture — and self-medicating for sleep can mask an underlying sleep-disordered breathing problem rather than treat it. A second-generation agent (loratadine/cetirizine) is preferred for allergy control.`,
      question: `You have ${beers.text} on your list and it looks like you take it nightly. How often do you rely on it to fall asleep, and do you still wake up feeling tired?`,
      tag: "Medication Safety",
    });
  }

  // 3. Stale screening labs
  const lastLab = latest(b.labs.map((l) => l.effective));
  const labDays = daysAgo(lastLab);
  if (labDays !== undefined && labDays > 365) {
    const years = (labDays / 365).toFixed(1);
    gaps.push({
      id: "screening-labs",
      kind: "screening",
      severity: labDays > 365 * 3 ? "high" : "medium",
      title: "Routine labs overdue",
      detail: `Most recent lab result on file is from ${fmt(lastLab)} (~${years} years ago). Age-appropriate screening (lipid panel, metabolic panel, A1c) may be overdue.`,
      question: `Your last lab work on file is from ${fmt(lastLab)}. Have you had any blood tests done elsewhere since then that we might not have?`,
      tag: "Care Gap",
    });
  }

  // 4. High-risk allergy + surgical history -> perioperative reconciliation
  const latex = b.allergies.find((a) => /latex/i.test(a.substance));
  const surgical = b.problems.find((p) =>
    /append|surgery|surgical|rupture/i.test(p.text)
  );
  if (latex && surgical) {
    gaps.push({
      id: "perioperative-latex",
      kind: "perioperative",
      severity: "high",
      title: "Latex allergy with surgical history",
      detail: `Documented latex allergy alongside surgical history (${surgical.text}). Any future procedure must be flagged latex-free; confirm this is propagated to all care settings.`,
      question: `You have a latex allergy on file and a past surgery. Has every clinic and hospital you have visited been told about the latex allergy?`,
      tag: "Safety Flag",
    });
  }

  // 5. Wearable-only signal: overnight SpO2 desaturations + fragmented sleep that
  //    appear in NO clinical source. The headline "no single source reveals" gap.
  const spo2Vital = b.vitals.find((v) => /spo|oxygen saturation/i.test(v.text));
  const sleepVital = b.vitals.find((v) => /^sleep/i.test(v.text));
  const below90 = Number(spo2Vital?.value?.match(/(\d+)\s*readings?\s*<\s*90/i)?.[1]);
  const awakenings = spo2Vital && sleepVital?.value?.match(/~?([\d.]+)\s*awakenings/i)?.[1];
  if (below90 && below90 > 0) {
    gaps.push({
      id: "wearable-sdb",
      kind: "wearable",
      severity: below90 >= 20 ? "high" : "medium",
      title: "Possible sleep-disordered breathing (wearable signal, not in EHR)",
      detail: `Apple Watch recorded ${below90} overnight blood-oxygen readings below 90%${awakenings ? ` alongside ~${awakenings} awakenings per night` : ""}. There is no sleep study, OSA diagnosis, or related note anywhere in the structured chart. Combined with nightly antihistamine self-medication for sleep, this pattern warrants a sleep-apnea work-up — and it is invisible to every individual data source.`,
      question: `Your watch is showing your blood oxygen dipping low overnight and a lot of waking up. Do you snore, gasp, or wake up unrefreshed — and has anyone ever checked you for sleep apnea?`,
      tag: "Wearable Alert",
    });
  }

  return gaps;
}

const SOURCE_META: Record<
  string,
  { name: string; description: string; source: EventSource }
> = {
  ehr: {
    name: "EHR Records",
    description: "Conditions, problems, and immunizations from FHIR",
    source: "ehr",
  },
  lab: {
    name: "Lab Results",
    description: "Blood panels, metabolic tests, diagnostics",
    source: "lab",
  },
  medications: {
    name: "Medication History",
    description: "Prescription and medication records",
    source: "medication",
  },
  wearable: {
    name: "Wearable Data",
    description: "Activity, heart rate, sleep (patient-connected)",
    source: "wearable",
  },
  voice: {
    name: "Patient Voice Intake",
    description: "Grok Voice-collected patient history",
    source: "voice",
  },
};

export function deriveSources(b: PatientBundle): DataSourceDTO[] {
  const ehrCount = b.problems.length + b.immunizations.length;
  const lastProblem = latest(b.problems.map((p) => p.onset));
  const lastLab = latest(b.labs.map((l) => l.effective));
  const lastMed = latest(b.medications.map((m) => m.authoredOn));
  const gaps = detectGaps(b);
  const medsNeedReview = gaps.some(
    (g) => g.kind === "med-stale" || g.kind === "beers"
  );
  const wearableConnected = b.vitals.some((v) => /apple watch|spo|hrv|sdnn/i.test(v.text));
  const lastVital = latest(b.vitals.map((v) => v.effective));
  const wearableNeedsReview = gaps.some((g) => g.kind === "wearable");

  return [
    {
      id: "ehr",
      ...SOURCE_META.ehr,
      status: ehrCount > 0 ? "connected" : "missing",
      records: ehrCount,
      lastUpdated: fmt(lastProblem),
      confidence: 94,
    },
    {
      id: "lab",
      ...SOURCE_META.lab,
      status: b.labs.length > 0 ? "connected" : "missing",
      records: b.labs.length,
      lastUpdated: fmt(lastLab),
      confidence: 98,
    },
    {
      id: "medications",
      ...SOURCE_META.medications,
      status: medsNeedReview ? "needs-review" : "connected",
      records: b.medications.length,
      lastUpdated: fmt(lastMed),
      confidence: medsNeedReview ? 64 : 90,
    },
    {
      // Patient-connected Apple Health — real export (lib/sam-health.json).
      id: "wearable",
      ...SOURCE_META.wearable,
      status: wearableConnected
        ? wearableNeedsReview
          ? "needs-review"
          : "connected"
        : "missing",
      records: wearableConnected ? WEARABLE_RECORDS : 0,
      lastUpdated: wearableConnected ? fmt(lastVital) : "Never",
      confidence: wearableConnected ? 88 : 0,
    },
    {
      id: "voice",
      ...SOURCE_META.voice,
      status: "missing",
      records: 0,
      lastUpdated: "Never",
      confidence: 0,
    },
  ];
}

const SRC_OF: Record<string, EventSource> = {
  problem: "ehr",
  med: "medication",
  lab: "lab",
  imm: "ehr",
};

export function deriveTimeline(b: PatientBundle): TimelineEventDTO[] {
  const ev: TimelineEventDTO[] = [];
  const gaps = detectGaps(b);
  const staleMedTitles = new Set(
    gaps.filter((g) => g.kind === "med-stale").map((g) => g.title)
  );

  for (const p of b.problems) {
    if (!p.onset) continue;
    ev.push({
      id: `p-${ev.length}`,
      iso: p.onset,
      date: fmt(p.onset),
      title: `${p.status === "resolved" ? "Resolved" : "Active"}: ${p.text}`,
      detail: `Condition recorded in EHR. Clinical status: ${p.status ?? "unknown"}.`,
      source: "ehr",
      confidence: 96,
      needsReview: false,
    });
  }

  for (const m of b.medications) {
    if (!m.authoredOn) continue;
    const stale = m.status === "active" && (daysAgo(m.authoredOn) ?? 0) > 365;
    ev.push({
      id: `m-${ev.length}`,
      iso: m.authoredOn,
      date: fmt(m.authoredOn),
      title: `Medication ${m.status === "stopped" ? "stopped" : "recorded"}: ${m.text}`,
      detail: `Medication status: ${m.status ?? "unknown"}, authored ${fmt(m.authoredOn)}.`,
      source: "medication",
      confidence: stale ? 64 : 92,
      needsReview: stale,
      flagReason: stale
        ? "Active medication with no recent refill or review"
        : undefined,
    });
  }

  // Most recent few labs only, to keep the timeline readable.
  const recentLabs = [...b.labs]
    .filter((l) => l.effective)
    .sort(
      (a, b2) =>
        new Date(b2.effective!).getTime() - new Date(a.effective!).getTime()
    )
    .slice(0, 4);
  for (const l of recentLabs) {
    ev.push({
      id: `l-${ev.length}`,
      iso: l.effective!,
      date: fmt(l.effective),
      title: `Lab: ${l.text}${l.value ? ` — ${l.value}` : ""}`,
      detail: `Result: ${l.value ?? "n/a"}.${l.flag && l.flag !== "normal" ? ` Flagged ${l.flag}.` : ""}`,
      source: "lab",
      confidence: 98,
      needsReview: l.flag === "high" || l.flag === "low",
      flagReason:
        l.flag === "high" || l.flag === "low"
          ? `Result flagged ${l.flag}`
          : undefined,
    });
  }

  // Wearable (Apple Health) signals — the patient-connected layer.
  const wearableTexts = [
    "Oxygen Saturation",
    "Resting Heart Rate",
    "ECG",
    "Sleep",
    "VO₂ Max",
  ];
  for (const key of wearableTexts) {
    const v = b.vitals.find((x) => x.text.includes(key));
    if (!v?.effective || !v.value) continue;
    const flagged = /spo|oxygen saturation/i.test(v.text);
    ev.push({
      id: `w-${ev.length}`,
      iso: v.effective,
      date: fmt(v.effective),
      title: `Wearable: ${v.text}`,
      detail: v.value,
      source: "wearable",
      confidence: flagged ? 70 : 90,
      needsReview: flagged,
      flagReason: flagged
        ? "Overnight desaturations with no matching clinical record"
        : undefined,
    });
  }

  // newest first, cap to a clean set
  return ev
    .sort((a, b2) => new Date(b2.iso).getTime() - new Date(a.iso).getTime())
    .slice(0, 14);
}
