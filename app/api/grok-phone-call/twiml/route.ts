// GET /api/grok-phone-call/twiml?question=...
// Twilio fetches this URL when the patient answers.
// Returns TwiML that opens a bidirectional media stream WebSocket to the bridge.

import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const question = searchParams.get("question") ?? "How are you feeling today?"
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  // Convert https:// → wss:// for the WebSocket bridge URL
  const wsUrl = appUrl.replace(/^https?:\/\//, "wss://")
  const bridgeUrl = `${wsUrl}/api/grok-phone-call/bridge?question=${encodeURIComponent(question)}`

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${bridgeUrl}" />
  </Connect>
</Response>`

  return new Response(twiml, {
    headers: { "Content-Type": "text/xml" },
  })
}
