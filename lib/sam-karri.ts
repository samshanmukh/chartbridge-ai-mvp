// Sam Karri — the demo patient. His structured clinical record (problems, meds,
// allergies, labs) is a cohesive, research-grounded synthetic chart for a 30yo
// active male whose real EHR can't be connected. His VITALS are REAL: extracted
// from his actual Apple Health export (lib/sam-health.json, 1.1M records).
//
// The clinical story is built so the reconciliation gaps no single source reveals
// line up across EHR + wearable + clinic CRM:
//   • family history of early CAD + rising resting HR + 3-yr-stale lipids  -> cardiovascular screening gap
//   • nightly OTC diphenhydramine for sleep + overnight SpO2 dips + fragmented sleep -> undiagnosed sleep-disordered breathing
//   • latex allergy + prior appendectomy -> perioperative safety flag
import health from "./sam-health.json";
import type { PatientBundle, Lab, Vital } from "./types";

const m = health.metrics as Record<string, { unit: string; latest: number | null; avg: number | null; min: number | null; max: number | null; n: number }>;
const rhr = m.RestingHeartRate;
const hrv = m.HeartRateVariabilitySDNN;
const vo2 = m.VO2Max;
const rr = m.RespiratoryRate;
const spo2 = health.spo2 as { avg: number; min: number; readings: number; below90: number; below95: number; pctBelow95: number };
const sleep = health.sleep as { avgNightlyHours: number; nightsTracked: number; awakenings: number };
const steps = health.steps as { avgPerDay: number; daysTracked: number };
const ecg = health.ecg as { count: number; latest: { classification: string; recorded: string } | null; classifications: string[] };

const awakeningsPerNight = sleep.nightsTracked
  ? Math.round((sleep.awakenings / sleep.nightsTracked) * 10) / 10
  : null;
const WEIGHT_KG = m.BodyMass?.latest ?? 86; // real, from Apple Health (kg)
const WEIGHT_LB = Math.round(WEIGHT_KG * 2.2046);
const HEIGHT_M = 1.854; // 6'1" (Apple Health height 6.08 ft)
const BMI = Math.round((WEIGHT_KG / (HEIGHT_M * HEIGHT_M)) * 10) / 10;

// Recent end of the resting-HR trend vs. the autumn low — the "creeping up" signal.
const rhrTrend = (health.metrics as { RestingHeartRate?: { trend?: { month: string; avg: number }[] } }).RestingHeartRate?.trend ?? [];
const rhrLow = rhrTrend.length ? Math.min(...rhrTrend.map((t) => t.avg)) : rhr?.min ?? null;

// Real Apple Health vitals, surfaced as the wearable layer of the chart.
const WEARABLE_VITALS: Vital[] = [
  { text: "Resting Heart Rate (Apple Watch)", value: `${rhr.latest} bpm — avg ${rhr.avg}, up from ${rhrLow} this spring`, effective: "2026-06-12" },
  { text: "Heart Rate Variability (SDNN)", value: `${hrv.latest} ms — avg ${hrv.avg} (low-normal)`, effective: "2026-06-12" },
  { text: "VO₂ Max (cardio fitness)", value: `${vo2.latest} mL/kg·min — above average`, effective: "2026-06-10" },
  { text: "Respiratory Rate", value: `${rr.avg} breaths/min avg (max ${rr.max})`, effective: "2026-06-12" },
  { text: "Oxygen Saturation (SpO₂, overnight)", value: `avg ${spo2.avg}% · ${spo2.below90} readings <90% · ${spo2.pctBelow95}% <95%`, effective: "2026-06-12" },
  { text: "Sleep", value: `${sleep.avgNightlyHours} h/night avg · ~${awakeningsPerNight} awakenings/night`, effective: "2026-06-12" },
  { text: "Daily Steps", value: `${steps.avgPerDay.toLocaleString()} avg over ${steps.daysTracked} days`, effective: "2026-06-12" },
  { text: "ECG", value: `${ecg.count} recordings · latest ${ecg.latest?.classification ?? "n/a"} (${ecg.latest?.recorded?.slice(0, 10) ?? "?"})${ecg.classifications.includes("High Heart Rate") ? " · some High Heart Rate captures" : ""}`, effective: ecg.latest?.recorded?.slice(0, 10) ?? "2026-04-27" },
  // Clinic-measured, mock
  { text: "Blood Pressure (clinic)", value: "128/82 mmHg", effective: "2023-03-15" },
  { text: "BMI", value: `${BMI} (${WEIGHT_LB} lb, 6'1")`, effective: "2026-06-12" },
];

// Last panel ~3.2 years ago -> triggers the "screening overdue" gap (high, given
// family history of early CAD). Values borderline-but-not-yet-disease, consistent
// with a 30yo, BMI 25, who lapsed on follow-up.
const LAB_DATE = "2023-03-15T09:20:00Z";
const LABS: Lab[] = [
  { text: "Total Cholesterol", value: "212 mg/dL", valueNum: 212, unit: "mg/dL", effective: LAB_DATE, flag: "high" },
  { text: "LDL Cholesterol", value: "138 mg/dL", valueNum: 138, unit: "mg/dL", effective: LAB_DATE, flag: "high" },
  { text: "HDL Cholesterol", value: "47 mg/dL", valueNum: 47, unit: "mg/dL", effective: LAB_DATE, flag: "low" },
  { text: "Triglycerides", value: "168 mg/dL", valueNum: 168, unit: "mg/dL", effective: LAB_DATE, flag: "high" },
  { text: "Hemoglobin A1c", value: "5.6 %", valueNum: 5.6, unit: "%", effective: LAB_DATE, flag: "normal" },
  { text: "Fasting Glucose", value: "98 mg/dL", valueNum: 98, unit: "mg/dL", effective: LAB_DATE, flag: "normal" },
  { text: "Vitamin D, 25-OH", value: "24 ng/mL", valueNum: 24, unit: "ng/mL", effective: LAB_DATE, flag: "low" },
  { text: "TSH", value: "2.1 mIU/L", valueNum: 2.1, unit: "mIU/L", effective: LAB_DATE, flag: "normal" },
  { text: "Hemoglobin", value: "15.2 g/dL", valueNum: 15.2, unit: "g/dL", effective: LAB_DATE, flag: "normal" },
];

export function buildSamBundle(): PatientBundle {
  return {
    source: "ChartBridge demo chart (clinical) + Apple Health export (vitals, real)",
    fhirVersion: "4.0.0",
    demographics: {
      id: "sam-karri",
      name: "Sam Karri",
      gender: "male",
      birthDate: "1995-09-25",
      age: 30,
    },
    problems: [
      { text: "Perennial allergic rhinitis", status: "active", onset: "2014-05-01" },
      { text: "Exercise-induced bronchoconstriction", status: "active", onset: "2016-03-12" },
      { text: "Family history of premature coronary artery disease (father, MI age 52)", status: "active", onset: "2014-05-01" },
      { text: "Overweight (BMI 25.0)", status: "active", onset: "2024-04-10" },
      { text: "History of appendectomy", status: "resolved", onset: "2013-08-20" },
      { text: "Sprain of left ankle", status: "resolved", onset: "2018-11-02" },
    ],
    medications: [
      { text: "Diphenhydramine 25 mg oral (OTC, nightly)", status: "active", authoredOn: "2020-06-15T00:00:00Z" },
      { text: "Fluticasone propionate nasal spray", status: "active", authoredOn: "2022-09-10T00:00:00Z" },
      { text: "Albuterol HFA inhaler (PRN)", status: "active", authoredOn: "2021-04-20T00:00:00Z" },
      { text: "Amoxicillin 500 mg", status: "stopped", authoredOn: "2013-08-21T00:00:00Z" },
    ],
    labs: LABS,
    vitals: WEARABLE_VITALS,
    allergies: [
      { substance: "Latex allergy", criticality: "high" },
      { substance: "Allergy to grass pollen", criticality: "low" },
      { substance: "House dust mite allergy", criticality: "low" },
      { substance: "Dander (animal) allergy", criticality: "low" },
    ],
    immunizations: [
      { vaccine: "Influenza, seasonal", date: "2025-10-02" },
      { vaccine: "COVID-19", date: "2023-09-15" },
      { vaccine: "Tetanus-diphtheria-pertussis (Tdap)", date: "2019-05-10" },
      { vaccine: "Hepatitis B", date: "2011-04-18" },
    ],
    documents: [],
    fetchedAt: new Date().toISOString(),
  };
}
