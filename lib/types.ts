// Shared types for the live data layer. UI-facing DTOs mirror the shapes the
// v0 components already consume, so wiring is a drop-in.

export type SourceStatus = "connected" | "needs-review" | "missing";
export type EventSource = "ehr" | "lab" | "medication" | "wearable" | "voice";
export type Severity = "high" | "medium" | "low";
export type DocType = "fax" | "email" | "call" | "note" | "referral";

export interface Demographics {
  id: string;
  name: string;
  gender?: string;
  birthDate?: string;
  age?: number;
}

export interface Problem {
  text: string;
  status?: string;
  onset?: string;
}
export interface Medication {
  text: string;
  status?: string;
  authoredOn?: string;
}
export interface Lab {
  text: string;
  value?: string;
  valueNum?: number;
  unit?: string;
  effective?: string;
  flag?: "high" | "low" | "normal";
}
export interface Vital {
  text: string;
  value?: string;
  effective?: string;
}
export interface Allergy {
  substance: string;
  criticality?: string;
}
export interface Immunization {
  vaccine: string;
  date?: string;
}

// The single normalized patient record everything else is derived from.
export interface PatientBundle {
  source: string;
  fhirVersion: string;
  demographics: Demographics;
  problems: Problem[];
  medications: Medication[];
  labs: Lab[];
  vitals: Vital[];
  allergies: Allergy[];
  immunizations: Immunization[];
  documents: { type?: string; date?: string }[];
  fetchedAt: string;
}

// ----- Clinic CRM (unstructured records ABOUT the patient) -----
export interface CrmDoc {
  id: string;
  patientId: string;
  docType: DocType;
  date: string;
  source: string;
  title: string;
  body: string;
}

export interface Citation {
  id: string;
  chunkText: string;
  docType: DocType;
  date: string;
  source: string;
  score?: number;
}

// ----- UI DTOs (match existing component interfaces) -----
export interface DataSourceDTO {
  id: string;
  name: string;
  description: string;
  status: SourceStatus;
  records: number;
  lastUpdated: string;
  confidence: number;
}

export interface TimelineEventDTO {
  id: string;
  date: string; // display string
  iso: string; // sortable
  title: string;
  detail: string;
  source: EventSource;
  confidence: number;
  needsReview: boolean;
  flagReason?: string;
}

export interface ReportSectionDTO {
  title: string;
  content: string;
  flag?: boolean;
  citations?: Citation[];
}

export interface InsightDTO {
  id: string;
  iconKey: "med" | "trend" | "calendar" | "alert" | "merge";
  title: string;
  severity: Severity;
  explanation: string;
  suggestedAction: string;
}

export interface VoicePromptDTO {
  id: string;
  question: string;
  response: string | null;
  tag: string;
}

// Data-driven care gap (drives reconciliation insights + voice intake prompts).
export interface Gap {
  id: string;
  kind: "med-stale" | "screening" | "beers" | "perioperative" | "reconcile";
  severity: Severity;
  title: string;
  detail: string;
  question: string; // natural-language question for the voice agent
  tag: string;
}

export interface PatientResponse {
  bundle: PatientBundle;
  sources: DataSourceDTO[];
  timeline: TimelineEventDTO[];
  gaps: Gap[];
  insights: InsightDTO[];
  live: boolean; // true = from FHIR server, false = cached fallback fixture
}
