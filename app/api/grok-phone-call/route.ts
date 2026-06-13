import { NextRequest, NextResponse } from "next/server"

// Simulates an outbound Grok Voice phone call to the patient.
// In production this would integrate with Twilio/Vonage to place a real call —
// for the MVP we run the Grok Voice session server-side and stream back the
// conversation transcript so the clinician can follow along in real time.

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const { phoneNumber, question } = await req.json()

  if (!phoneNumber || !question) {
    return NextResponse.json({ error: "phoneNumber and question are required" }, { status: 400 })
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 })
  }

  // Stream back simulated call events as newline-delimited JSON
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
      }

      try {
        // Phase 1 — dialing
        send({ type: "call.dialing", phoneNumber })
        await delay(1500)

        // Phase 2 — connected
        send({ type: "call.connected" })
        await delay(800)

        // Phase 3 — Grok speaks the question via text completion (simulates TTS on call)
        send({ type: "call.grok_speaking", text: question })
        await delay(2000)

        // Phase 4 — Grok listens (simulate patient speaking for demo)
        send({ type: "call.patient_speaking" })
        await delay(3000)

        // Phase 5 — Get Grok to generate a realistic patient response + analysis
        const completion = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "grok-4",
            stream: false,
            messages: [
              {
                role: "system",
                content: `You are simulating a real phone call between an AI clinical assistant and a patient.
The AI just asked the patient: "${question}"
Generate TWO things in valid JSON:
1. "patientResponse": A realistic, natural 1-3 sentence spoken response from a patient with Type 2 diabetes. Make it feel authentic — the patient might be uncertain, mention habits, or ask a question back.
2. "clinicalAnalysis": A brief clinical assessment (2-3 sentences) of the patient's response from a clinician's perspective, noting any red flags or positive findings.
Return ONLY valid JSON with those two keys.`,
              },
              { role: "user", content: "Generate the response." },
            ],
          }),
        })

        const completionData = await completion.json()
        const raw = completionData.choices?.[0]?.message?.content ?? "{}"
        let parsed: { patientResponse?: string; clinicalAnalysis?: string } = {}
        try {
          // Strip markdown code fences if present
          const clean = raw.replace(/```json\n?|\n?```/g, "").trim()
          parsed = JSON.parse(clean)
        } catch {
          parsed = {
            patientResponse: raw,
            clinicalAnalysis: "Unable to parse clinical analysis.",
          }
        }

        send({ type: "call.transcript", text: parsed.patientResponse ?? "" })
        await delay(500)
        send({ type: "call.analysis", text: parsed.clinicalAnalysis ?? "" })
        send({ type: "call.ended" })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        send({ type: "call.error", message: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
