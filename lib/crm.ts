// The "patient CRM": unstructured records a clinic accumulates ABOUT a patient
// that never make it into structured FHIR fields — inbound faxes, referral
// letters, phone-call notes, outside records. The FHIR sandbox has no
// DocumentReference data, so we synthesize a plausible corpus FROM the real
// bundle (same patient, real drug/allergy/condition names) and index it for RAG.
import type { PatientBundle, CrmDoc } from "./types";

function fmt(iso?: string): string {
  if (!iso) return "2024-01-01";
  return iso.slice(0, 10);
}

export function seedCrmDocs(b: PatientBundle): CrmDoc[] {
  const pid = b.demographics.id;
  const name = b.demographics.name;
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
  const envAllergies = b.allergies
    .map((a) => a.substance)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");

  // 1. Inbound referral letter — allergy/ENT (from the rhinitis problem)
  if (rhinitis) {
    add({
      id: "crm-referral-allergy",
      docType: "referral",
      date: "2023-09-14",
      source: "Fax from Valley Primary Care → Allergy & Immunology",
      title: `Referral: ${name} — perennial allergic rhinitis`,
      body: `Dear Colleague, please evaluate ${name} for ${rhinitis.text}. Symptoms are year-round with seasonal worsening. Patient self-manages with over-the-counter ${antihistamine?.text ?? "antihistamines"} but reports daytime drowsiness. Environmental sensitivities on file include ${envAllergies || "multiple aeroallergens"}. Requesting allergy panel and consideration of a non-sedating regimen or immunotherapy. No prior specialist evaluation documented.`,
    });
  }

  // 2. Pharmacy fax — long-term OTC antihistamine use / refill
  if (antihistamine) {
    add({
      id: "crm-pharmacy-fax",
      docType: "fax",
      date: "2024-02-03",
      source: "Fax from Community Pharmacy",
      title: `Pharmacy note: ${antihistamine.text}`,
      body: `Patient ${name} has a long-standing record of purchasing ${antihistamine.text} (first on file ${fmt(antihistamine.authoredOn)}). Pharmacist counseling note: patient takes it nightly for allergies and to help sleep. Flagged for prescriber review given chronic first-generation antihistamine use and anticholinergic burden. Recommend confirming ongoing need and considering second-generation alternative.`,
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
      body: `${name} called ahead of an outpatient procedure to confirm her latex allergy is on file. She stated a prior clinic "almost used latex gloves" before she reminded them. Reaction history: contact urticaria. Advised all care settings must be flagged latex-free. Staff to verify allergy banner propagates to any referral or hospital encounter.`,
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

  // 5. Email thread — patient-initiated question (contraception / med list)
  const contraceptive = activeMeds.find((m) =>
    /nuvaring|etonogestrel|norethindrone|levonorgestrel|seasonique/i.test(m.text)
  );
  if (contraceptive) {
    add({
      id: "crm-email-contraception",
      docType: "email",
      date: "2024-11-08",
      source: "Patient portal message",
      title: `Email: medication question`,
      body: `Message from ${name}: "I'm still using ${contraceptive.text}. Is it okay to keep taking my allergy medicine with it? Also I never heard back about whether I need any blood tests this year." No documented reply on file. Routed to nursing; follow-up not closed.`,
    });
  }

  // 6. Records-request fax — care continuity gap
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
