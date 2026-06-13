// Dev/ops endpoint to (1) seed Sam's CRM corpus into an xAI Collection and
// (2) probe search. Run once, then put the returned collectionId in
// XAI_COLLECTION_ID and restart.
//   POST /api/collections/seed                  -> create + upload, returns ids
//   GET  /api/collections/seed?q=sleep%20apnea  -> search the configured collection
import { NextResponse } from "next/server";
import { getBundleWithFallback } from "@/lib/fhir";
import { seedCollection, searchCollection } from "@/lib/xai-collections";
import { XAI_COLLECTION_ID } from "@/lib/config";
import { DEFAULT_PATIENT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { bundle } = await getBundleWithFallback(body.patientId || DEFAULT_PATIENT_ID);
  const result = await seedCollection(bundle, body.collectionId || undefined);
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "medication reconciliation allergies sleep";
  const cid = searchParams.get("collectionId") || XAI_COLLECTION_ID;
  if (!cid) return NextResponse.json({ error: "no collectionId (set XAI_COLLECTION_ID or pass ?collectionId=)" }, { status: 400 });
  const out = await searchCollection(cid, q, 4);
  return NextResponse.json(out);
}
