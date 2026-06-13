// GET /api/grok-phone-call/events?callSid=...
// Server-Sent Events stream — the frontend polls this after the call is placed
// to receive real-time status updates (ringing, answered, transcript, completed).

import { NextRequest } from "next/server"
import { callEvents } from "../status/route"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const callSid = searchParams.get("callSid") ?? ""

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      send({ type: "call.watching", callSid })

      // Poll every 500ms for up to 3 minutes
      const maxAttempts = 360
      let attempts = 0
      let lastStatus = ""

      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500))
        attempts++

        const state = callEvents.get(callSid)
        if (!state) continue

        if (state.status !== lastStatus) {
          lastStatus = state.status

          switch (state.status) {
            case "initiated":
              send({ type: "call.dialing" }); break
            case "ringing":
              send({ type: "call.ringing" }); break
            case "answered":
            case "in-progress":
              send({ type: "call.connected" }); break
            case "completed":
            case "failed":
            case "busy":
            case "no-answer":
              send({ type: "call.ended", status: state.status, transcript: state.transcript ?? "" })
              controller.close()
              return
          }
        }

        // If transcript arrived, surface it
        if (state.transcript && state.status !== "completed") {
          send({ type: "call.transcript", text: state.transcript })
        }
      }

      send({ type: "call.error", message: "Timed out waiting for call to complete" })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  })
}
