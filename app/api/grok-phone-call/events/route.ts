// GET /api/grok-phone-call/events?callSid=...
// SSE stream — polls callEventStore (written by /recording) and pushes events
// to the browser in real time: dialing → connected → transcript → analysis → ended.

import { NextRequest } from "next/server"
import { callEventStore } from "@/app/api/grok-phone-call/recording/route"
import { callStatusStore } from "@/app/api/grok-phone-call/status/route"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const callSid = new URL(req.url).searchParams.get("callSid") ?? ""
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      send({ type: "call.dialing" })

      let cursor = 0
      let lastTwilioStatus = ""
      const maxIterations = 240 // 240 × 500ms = 120s

      for (let i = 0; i < maxIterations; i++) {
        await new Promise((r) => setTimeout(r, 500))

        // Surface Twilio call-leg status changes (ringing, answered)
        const twilioStatus = callStatusStore.get(callSid) ?? ""
        if (twilioStatus !== lastTwilioStatus) {
          lastTwilioStatus = twilioStatus
          if (twilioStatus === "ringing")                    send({ type: "call.ringing" })
          if (twilioStatus === "in-progress")                send({ type: "call.connected" })
          if (twilioStatus === "grok-speaking")              send({ type: "call.grok_speaking" })
        }

        // Drain new events written by /recording (transcript, analysis, ended)
        const events = callEventStore.get(callSid) ?? []
        const fresh = events.slice(cursor)
        cursor += fresh.length

        for (const ev of fresh) {
          send(ev)
          if (ev.type === "call.ended" || ev.type === "call.error") {
            callEventStore.delete(callSid)
            callStatusStore.delete(callSid)
            controller.close()
            return
          }
        }
      }

      send({ type: "call.error", message: "Call timed out after 2 minutes" })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection:      "keep-alive",
    },
  })
}
