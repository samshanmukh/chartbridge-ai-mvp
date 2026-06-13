// POST /api/grok-phone-call/recording?callSid=...&question=...
// Called by Twilio when the patient's recording is ready.
// 1. Downloads the recording audio
// 2. Transcribes with xAI speech-to-text (grok-2-audio)
// 3. Runs Grok-4 clinical analysis
// 4. Stores the result so the SSE /events stream can push it to the browser

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

// In-memory store shared with the /events SSE route (same serverless instance on Vercel)
// Key: callSid, Value: event object
export const callEventStore: Map<string, { type: string; text?: string; message?: string; done?: boolean }[]> = new Map()

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callSid  = searchParams.get("callSid")  ?? ""
  const question = searchParams.get("question") ?? ""

  const formData = await req.formData()
  const recordingUrl    = formData.get("RecordingUrl")?.toString()
  const recordingSid    = formData.get("RecordingSid")?.toString()
  const recordingStatus = formData.get("RecordingStatus")?.toString()

  if (!recordingUrl || recordingStatus === "failed") {
    pushEvent(callSid, { type: "call.error", message: "Recording failed or was empty" })
    pushEvent(callSid, { type: "call.ended", done: true })
    return new Response("ok")
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    pushEvent(callSid, { type: "call.error", message: "XAI_API_KEY not configured" })
    return new Response("ok")
  }

  try {
    pushEvent(callSid, { type: "call.patient_speaking" })

    // Download the recording (mp3) from Twilio — auth required
    const accountSid = process.env.TWILIO_ACCOUNT_SID ?? ""
    const authToken  = process.env.TWILIO_AUTH_TOKEN ?? ""
    const audioRes = await fetch(`${recordingUrl}.mp3`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
    })
    const audioBuffer = await audioRes.arrayBuffer()
    const audioBase64 = Buffer.from(audioBuffer).toString("base64")

    pushEvent(callSid, { type: "call.transcribing" })

    // Transcribe with xAI grok-2-audio
    const transcribeRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-2-audio",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: audioBase64, format: "mp3" },
              },
              {
                type: "text",
                text: "Please transcribe exactly what the person said. Return only the transcript, no other text.",
              },
            ],
          },
        ],
      }),
    })

    const transcribeData = await transcribeRes.json() as { choices?: { message: { content: string } }[] }
    const transcript = transcribeData.choices?.[0]?.message?.content?.trim() ?? ""

    if (!transcript) {
      pushEvent(callSid, { type: "call.error", message: "Could not transcribe the patient response" })
      pushEvent(callSid, { type: "call.ended", done: true })
      return new Response("ok")
    }

    pushEvent(callSid, { type: "call.transcript", text: transcript })

    // Run Grok-4 clinical analysis
    pushEvent(callSid, { type: "call.analyzing" })

    const analysisRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4",
        messages: [
          {
            role: "system",
            content: "You are a clinical decision-support AI. Given a patient's verbal response to a care gap question, provide a concise clinical assessment (2-3 sentences) noting any concerns, recommended follow-up actions, and confidence level. Be direct and clinical.",
          },
          {
            role: "user",
            content: `Clinical question asked: "${question}"\n\nPatient response: "${transcript}"\n\nProvide your clinical assessment.`,
          },
        ],
      }),
    })

    const analysisData = await analysisRes.json() as { choices?: { message: { content: string } }[] }
    const analysis = analysisData.choices?.[0]?.message?.content?.trim() ?? ""

    if (analysis) {
      pushEvent(callSid, { type: "call.analysis", text: analysis })
    }

    pushEvent(callSid, { type: "call.ended", done: true })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    pushEvent(callSid, { type: "call.error", message: msg })
    pushEvent(callSid, { type: "call.ended", done: true })
  }

  return new Response("ok")
}

function pushEvent(callSid: string, event: { type: string; text?: string; message?: string; done?: boolean }) {
  if (!callSid) return
  if (!callEventStore.has(callSid)) callEventStore.set(callSid, [])
  callEventStore.get(callSid)!.push(event)
}
