// GET /api/grok-phone-call/twiml?question=...&callSid=...
// Twilio fetches this when the patient answers.
// Uses Grok TTS to speak the question, then records the patient's response.
// On recording completion Twilio POSTs to /api/grok-phone-call/recording.

import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const question = searchParams.get("question") ?? "How are you feeling today?"
  const callSid  = searchParams.get("callSid")  ?? ""

  const host    = req.headers.get("host") ?? "localhost:3000"
  const protocol = host.startsWith("localhost") ? "http" : "https"
  const appUrl  = (process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`).replace(/\/$/, "")

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? ""
  const withBypass = (url: string) =>
    bypassSecret
      ? `${url}${url.includes("?") ? "&" : "?"}x-vercel-protection-bypass=${bypassSecret}`
      : url

  const recordingCallbackUrl = withBypass(
    `${appUrl}/api/grok-phone-call/recording?callSid=${encodeURIComponent(callSid)}&question=${encodeURIComponent(question)}`
  )

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${escapeXml(question)}</Say>
  <Say voice="Polly.Joanna">Please respond after the beep. Press any key or stay silent for 3 seconds when you are done.</Say>
  <Record
    action="${recordingCallbackUrl}"
    method="POST"
    maxLength="120"
    timeout="3"
    finishOnKey="any"
    playBeep="true"
  />
  <Say>We did not receive a recording. Goodbye.</Say>
</Response>`

  return new Response(twiml, {
    headers: { "Content-Type": "text/xml" },
  })
}

function escapeXml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
