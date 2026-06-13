// Live FHIR R4 client against the zero-auth SMART Health IT launcher.
// Normalizes one Synthea patient into a single PatientBundle. Falls back to a
// cached fixture if the public sandbox is slow or down (keeps the demo safe).
import "server-only";
import { FHIR_BASE, DEFAULT_PATIENT_ID } from "./config";
import fallbackData from "./fallback-patient.json";
import { buildSamBundle } from "./sam-karri";
import type {
  PatientBundle,
  Lab,
  Problem,
  Medication,
  Vital,
} from "./types";

type Json = Record<string, any>;

async function searchAll(
  resourceType: string,
  query: Record<string, string>,
  signal?: AbortSignal
): Promise<Json[]> {
  const qs = new URLSearchParams({ ...query, _count: "100" }).toString();
  let url: string | null = `${FHIR_BASE}/${resourceType}?${qs}`;
  const out: Json[] = [];
  let pages = 0;
  while (url && pages < 10) {
    const res = await fetch(url, {
      headers: { Accept: "application/fhir+json" },
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${resourceType} ${res.status}`);
    const bundle: Json = await res.json();
    for (const e of bundle.entry ?? []) out.push(e.resource);
    url =
      (bundle.link ?? []).find((l: Json) => l.relation === "next")?.url ?? null;
    pages++;
  }
  return out;
}

async function getPatient(id: string, signal?: AbortSignal): Promise<Json> {
  const res = await fetch(`${FHIR_BASE}/Patient/${id}`, {
    headers: { Accept: "application/fhir+json" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Patient ${res.status}`);
  return res.json();
}

function ageFrom(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// Prefer FHIR interpretation codes; otherwise leave normal. Synthea stamps
// interpretation on some observations.
function labFlag(o: Json): Lab["flag"] {
  const code = o.interpretation?.[0]?.coding?.[0]?.code;
  if (!code) return "normal";
  if (["H", "HH", "HU", "A"].includes(code)) return "high";
  if (["L", "LL", "LU"].includes(code)) return "low";
  return "normal";
}

function display(c?: Json): string | undefined {
  return c?.text ?? c?.coding?.[0]?.display;
}

export async function fetchPatientBundle(
  patientId = DEFAULT_PATIENT_ID
): Promise<PatientBundle> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const signal = controller.signal;
  try {
    const p = patientId;
    const [
      patient,
      conditions,
      medsRequest,
      medsStatement,
      labs,
      vitals,
      allergies,
      immunizations,
      documents,
    ] = await Promise.all([
      getPatient(p, signal),
      searchAll("Condition", { patient: p }, signal),
      searchAll("MedicationRequest", { patient: p }, signal),
      searchAll("MedicationStatement", { patient: p }, signal),
      searchAll("Observation", { patient: p, category: "laboratory" }, signal),
      searchAll("Observation", { patient: p, category: "vital-signs" }, signal),
      searchAll("AllergyIntolerance", { patient: p }, signal),
      searchAll("Immunization", { patient: p }, signal),
      searchAll("DocumentReference", { patient: p }, signal),
    ]);

    const name = patient.name?.[0] ?? {};
    const fullName =
      [(name.given ?? []).join(" "), name.family].filter(Boolean).join(" ") ||
      "Unknown Patient";

    const problems: Problem[] = conditions.map((c) => ({
      text: display(c.code) ?? "Unknown condition",
      status: c.clinicalStatus?.coding?.[0]?.code,
      onset: c.onsetDateTime,
    }));

    const medications: Medication[] = [...medsRequest, ...medsStatement].map(
      (m) => ({
        text: display(m.medicationCodeableConcept) ?? "Unknown medication",
        status: m.status,
        authoredOn: m.authoredOn ?? m.effectiveDateTime,
      })
    );

    const labList: Lab[] = labs.map((o) => {
      const vq = o.valueQuantity;
      return {
        text: display(o.code) ?? "Lab",
        value: vq
          ? `${Number(vq.value).toFixed(1)} ${vq.unit ?? ""}`.trim()
          : o.valueString,
        valueNum: vq ? Number(vq.value) : undefined,
        unit: vq?.unit,
        effective: o.effectiveDateTime,
        flag: labFlag(o),
      };
    });

    const vitalList: Vital[] = vitals.map((o) => ({
      text: display(o.code) ?? "Vital",
      value: o.valueQuantity
        ? `${Number(o.valueQuantity.value).toFixed(1)} ${o.valueQuantity.unit ?? ""}`.trim()
        : undefined,
      effective: o.effectiveDateTime,
    }));

    return {
      source: FHIR_BASE,
      fhirVersion: "4.0.0",
      demographics: {
        id: patient.id,
        name: fullName,
        gender: patient.gender,
        birthDate: patient.birthDate,
        age: ageFrom(patient.birthDate),
      },
      problems,
      medications,
      labs: labList,
      vitals: vitalList,
      allergies: allergies.map((a) => ({
        substance: display(a.code) ?? "Unknown allergen",
        criticality: a.criticality,
      })),
      immunizations: immunizations.map((i) => ({
        vaccine: display(i.vaccineCode) ?? "Vaccine",
        date: i.occurrenceDateTime,
      })),
      documents: documents.map((d) => ({ type: d.type?.text, date: d.date })),
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// The demo patient is Sam Karri: a cohesive synthetic clinical chart fused with
// his REAL Apple Health vitals (lib/sam-karri.ts). Served deterministically so
// the demo is stable — the live SMART/FHIR client below stays wired and is used
// when an explicit external patientId is requested.
export async function getBundleWithFallback(
  patientId = DEFAULT_PATIENT_ID
): Promise<{ bundle: PatientBundle; live: boolean }> {
  if (patientId === DEFAULT_PATIENT_ID || patientId === "sam-karri") {
    return { bundle: buildSamBundle(), live: true };
  }
  try {
    const bundle = await fetchPatientBundle(patientId);
    return { bundle, live: true };
  } catch (err) {
    console.warn("[fhir] live fetch failed, using cached fixture:", err);
    return { bundle: fallbackData as PatientBundle, live: false };
  }
}
