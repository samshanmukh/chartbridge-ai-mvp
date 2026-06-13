// POST /api/grok-phone-call/status
// Twilio status callback — receives call lifecycle events and stores them
// in a global map so the frontend SSE polling route can serve them.

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Simple map: callSid → latest Twilio call status string (ringing, in-progress, etc.)
export const callStatusStore: Map<string, string> = new Map()

// Also handle GET so Vercel health-checks don't 405
export async function GET() {
  return new NextResponse("OK", { status: 200 })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = new URLSearchParams(body)

  const callSid    = params.get("CallSid") ?? ""
  const callStatus = params.get("CallStatus") ?? ""

  if (callSid && callStatus) {
    callStatusStore.set(callSid, callStatus)
  }

  // Twilio status callbacks don't need TwiML — 204 No Content is the correct response
  return new NextResponse(null, { status: 204 })
}
