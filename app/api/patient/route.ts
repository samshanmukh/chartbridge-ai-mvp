import { NextResponse } from "next/server";
import { getBundleWithFallback } from "@/lib/fhir";
import {
  deriveSources,
  deriveTimeline,
  detectGaps,
  deriveInsights,
} from "@/lib/derive";
import { DEFAULT_PATIENT_ID } from "@/lib/config";
import type { PatientResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse<PatientResponse>> {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("patientId") || DEFAULT_PATIENT_ID;
  const { bundle, live } = await getBundleWithFallback(id);
  const gaps = detectGaps(bundle);
  return NextResponse.json({
    bundle,
    sources: deriveSources(bundle),
    timeline: deriveTimeline(bundle),
    gaps,
    insights: deriveInsights(gaps),
    live,
  });
}
