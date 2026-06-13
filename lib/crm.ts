// The "patient CRM": unstructured records a clinic accumulates ABOUT a patient
// that never make it into structured FHIR fields — inbound faxes, referral
// letters, phone-call notes, outside records, portal messages. We synthesize a
// plausible corpus FROM the patient's bundle (same real drug/allergy/condition
// names) and index it for RAG. For Sam Karri the corpus deliberately carries the
// sleep + family-history threads that corroborate the wearable gap — so RAG
// surfaces evidence that lives in no structured field.
import type { PatientBundle, CrmDoc } from "./types";

function fmt(iso?: string): string {
  if (!iso) return "2024-01-01";
  return iso.slice(0, 10);
}

export function seedCrmDocs(b: PatientBundle): CrmDoc[] {
  const pid = b.demographics.id;
  const name = b.demographics.name;
  const first = name.split(" ")[0];
  const docs: CrmDoc[] = [];
  const add = (d: Omit<CrmDoc, "patientId">) =>
    docs.push({ ...d, patientId: pid });

  const activeMeds = b.medications.filter((m) => m.status === "active");
  const antihistamine = activeMeds.find((m) =>
    /diphenhydramine|hydroxyzine|chlorpheniramine/i.test(m.text)
  );
  const rhinitis = b.problems.find((p) => /rhinitis|allerg/i.test(p.text));
  const surgical = b.problems.find((p) =>
    /append|surger|rupture/i.test(p.text)
  );
  const latex = b.allergies.find((a) => /latex/i.test(a.substance));
  const familyHx = b.problems.find((p) => /family history|premature coronary|father/i.test(p.text));
  const envAllergies = b.allergies
    .map((a) => a.substance)
    .filter((s) => !/latex/i.test(s))
    .slice(0, 4)
    .join(", ");

  // 1. Inbound referral letter — allergy/ENT (rhinitis), carrying the sleep complaint
  if (rhinitis) {
    add({
      id: "crm-referral-allergy",
      docType: "referral",
      date: "2023-09-14",
      source: "Fax from Valley Primary Care → Allergy & Immunology",
      title: `Referral: ${name} — perennial allergic rhinitis`,
      body: `Dear Colleague, please evaluate ${name} (30M) for ${rhinitis.text}. Symptoms are year-round with seasonal worsening. Patient self-manages with over-the-counter ${antihistamine?.text ?? "antihistamines"} taken at night and reports he relies on it to fall asleep but still wakes unrefreshed. Environmental sensitivities on file include ${envAllergies || "multiple aeroallergens"}. He is an avid runner/swimmer. Requesting allergy panel and consideration of a non-sedating regimen; please also weigh whether the nighttime symptoms warrant sleep evaluation. No prior specialist evaluation documented.`,
    });
  }

  // 2. Pharmacy fax — long-term OTC antihistamine used for sleep
  if (antihistamine) {
    add({
      id: "crm-pharmacy-fax",
      docType: "fax",
      date: "2024-02-03",
      source: "Fax from Community Pharmacy",
      title: `Pharmacy note: ${antihistamine.text}`,
      body: `Patient ${name} has a long-standing record of purchasing ${antihistamine.text} (first on file ${fmt(antihistamine.authoredOn)}). Pharmacist counseling note: patient takes it nightly for allergies and "to be able to sleep." Flagged for prescriber review given chronic first-generation antihistamine use, anticholinergic burden, and that nightly sedative-antihistamine use for sleep can mask an untreated sleep problem. Recommend confirming ongoing need and a second-generation alternative.`,
    });
  }

  // 3. Phone-call note — latex allergy / perioperative safety
  if (latex) {
    add({
      id: "crm-call-latex",
      docType: "call",
      date: "2024-05-20",
      source: "Phone call — front desk triage note",
      title: `Call note: latex allergy reminder`,
      body: `${name} called ahead of an outpatient procedure to confirm his latex allergy is on file. He stated a prior clinic "almost used latex gloves" before he reminded them. Reaction history: contact urticaria. Advised all care settings must be flagged latex-free. Staff to verify allergy banner propagates to any referral or hospital encounter.`,
    });
  }

  // 4. Outside-records fax — operative note (surgical history)
  if (surgical) {
    add({
      id: "crm-op-note",
      docType: "fax",
      date: fmt(surgical.onset),
      source: "Fax from Regional Hospital — Health Information Management",
      title: `Outside records: operative note (${surgical.text})`,
      body: `Operative summary received for ${name}: ${surgical.text}. Laparoscopic appendectomy performed without complication. Anesthesia note documents latex-free precautions per patient allergy. Post-op course uneventful, discharged day 1. No follow-up issues reported. Document scanned to chart; not previously reconciled into the problem list.`,
    });
  }

  // 5. Patient portal email — sleep / fatigue thread (corroborates the wearable gap)
  add({
    id: "crm-email-sleep",
    docType: "email",
    date: "2025-11-12",
    source: "Patient portal message",
    title: `Email: trouble sleeping / always tired`,
    body: `Message from ${first}: "I'm sleeping 7+ hours but I wake up exhausted and feel foggy at work. My girlfriend says I snore loudly and sometimes seem to stop breathing for a few seconds. My Apple Watch keeps flagging low blood oxygen at night. I've been taking ${antihistamine?.text ?? "an antihistamine"} to fall asleep. Is this something I should get checked?" No documented reply on file. Routed to nursing; follow-up not closed.`,
  });

  // 6. Primary-care note — family cardiac history (justifies earlier screening)
  if (familyHx) {
    add({
      id: "crm-call-familyhx",
      docType: "note",
      date: "2023-03-15",
      source: "Primary care visit note",
      title: `Note: family cardiac history`,
      body: `${name} reports his father had a myocardial infarction at age 52 and a paternal uncle with early stents. Given premature family history, patient counseled that lipid and metabolic screening is indicated despite his age and fitness. Baseline panel drawn today. Plan to repeat in 12 months — no evidence the repeat was completed.`,
    });
  }

  // 7. Records-request fax — care continuity gap
  add({
    id: "crm-records-request",
    docType: "fax",
    date: "2025-01-15",
    source: "Fax from Urgent Care Clinic",
    title: `Records request — ${name}`,
    body: `Urgent care requesting ${name}'s active medication list and allergy history following a walk-in visit for upper respiratory symptoms. Notes the patient could not recall all current medications. Highlights value of a reconciled, portable medication and allergy summary across care settings.`,
  });

  return docs;
}
