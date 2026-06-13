// POST /api/grok-phone-call
// Places a real outbound call via Twilio REST API.
// When the patient picks up, Twilio fetches /api/grok-phone-call/twiml which
// opens a media stream WebSocket to /api/grok-phone-call/bridge — bridging
// the patient's phone audio to xAI Grok Voice in real time.

import { NextRequest, NextResponse } from "next/server"
import twilio from "twilio"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const { phoneNumber, question } = await req.json()

  if (!phoneNumber || !question) {
    return NextResponse.json({ error: "phoneNumber and question are required" }, { status: 400 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: "Twilio environment variables not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)" }, { status: 500 })
  }

  // Derive the public app URL from the incoming request if not explicitly set.
  // Strip trailing slash to prevent double-slash in constructed URLs.
  const host = req.headers.get("host") ?? "localhost:3000"
  const protocol = host.startsWith("localhost") ? "http" : "https"
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`).replace(/\/$/, "")

  // Append Vercel deployment protection bypass secret to all Twilio callback URLs
  // so Twilio's requests are not blocked by Vercel's authentication wall.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? ""
  // Helper: appends bypass param correctly whether URL already has query params or not
  const withBypass = (url: string) =>
    bypassSecret
      ? `${url}${url.includes("?") ? "&" : "?"}x-vercel-protection-bypass=${bypassSecret}`
      : url

  try {
    const client = twilio(accountSid, authToken)

    // Encode the clinical question into the TwiML URL so the voice can use it
    const encodedQuestion = encodeURIComponent(question)
    const twimlUrl  = withBypass(`${appUrl}/api/grok-phone-call/twiml?question=${encodedQuestion}`)
    const statusUrl = withBypass(`${appUrl}/api/grok-phone-call/status`)

    const call = await client.calls.create({
      to: phoneNumber,
      from: fromNumber,
      url: twimlUrl,
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    })

    return NextResponse.json({ callSid: call.sid, status: call.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
