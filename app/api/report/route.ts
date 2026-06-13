import { NextResponse } from "next/server";
import { getBundleWithFallback } from "@/lib/fhir";
import { detectGaps } from "@/lib/derive";
import { retrieveCrm } from "@/lib/vector";
import { generateReport } from "@/lib/report";
import { DEFAULT_PATIENT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = body.patientId || DEFAULT_PATIENT_ID;

  const { bundle, live } = await getBundleWithFallback(id);
  const gaps = detectGaps(bundle);

  // Retrieve the most relevant clinic-CRM records to ground the report.
  const query = [
    "medication reconciliation, allergies, care gaps, follow-up,",
    gaps.map((g) => g.title).join(", "),
    bundle.medications
      .filter((m) => m.status === "active")
      .map((m) => m.text)
      .join(", "),
  ].join(" ");
  const { citations, mode } = await retrieveCrm(bundle, query, 4);

  const report = await generateReport(bundle, gaps, citations);

  return NextResponse.json({
    ...report,
    live,
    crmMode: mode,
    patientName: bundle.demographics.name,
  });
}
