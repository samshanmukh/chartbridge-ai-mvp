// POST /api/grok-phone-call/status
// Twilio status callback — receives call lifecycle events and stores them
// in a global map so the frontend SSE polling route can serve them.

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// In-memory store keyed by callSid — stores latest status + transcript
// In production this would be Redis/Supabase
export const callEvents: Map<string, { status: string; transcript?: string; analysis?: string }> =
  (globalThis as unknown as { _callEvents?: typeof callEvents })._callEvents ??
  (() => {
    const m = new Map<string, { status: string; transcript?: string; analysis?: string }>()
    ;(globalThis as unknown as { _callEvents: typeof m })._callEvents = m
    return m
  })()

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = new URLSearchParams(body)

  const callSid    = params.get("CallSid") ?? ""
  const callStatus = params.get("CallStatus") ?? ""

  if (callSid) {
    const existing = callEvents.get(callSid) ?? { status: "" }
    callEvents.set(callSid, { ...existing, status: callStatus })
  }

  return new NextResponse("OK", { status: 200 })
}
