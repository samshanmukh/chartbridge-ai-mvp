import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { DEFAULT_PATIENT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

// Fire-and-forget trigger for the autonomous pipeline. Inngest is optional: if
// it isn't configured (no dev server / no event key), we fail soft so the rest
// of the app is unaffected — the synchronous /api/report still does the work.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patientId = body.patientId || DEFAULT_PATIENT_ID;
  try {
    const { ids } = await inngest.send({
      name: "patient/pipeline.requested",
      data: { patientId },
    });
    return NextResponse.json({ queued: true, eventIds: ids });
  } catch (e) {
    return NextResponse.json({ queued: false, reason: String(e) });
  }
}
