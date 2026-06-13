// GET /api/grok-phone-call/bridge?question=...
// This is the WebSocket bridge between Twilio's media stream and xAI Grok Voice.
//
// Twilio sends:
//   - "connected" message on open
//   - "start"     message with stream metadata (callSid, streamSid)
//   - "media"     messages: { payload: <base64 mulaw 8kHz audio> }
//   - "stop"      message when call ends
//
// xAI Grok Voice expects:
//   - WebSocket with subprotocol "xai-client-secret.<token>"
//   - input_audio_buffer.append with base64 PCM 16-bit 8kHz (converted from mulaw)
//   - response.output_audio.delta back as base64 PCM → must be re-encoded to mulaw for Twilio

import { NextRequest } from "next/server"
import { WebSocket as NodeWS } from "ws"
import { callEvents } from "../status/route"

export const runtime = "nodejs"

// mulaw decoder — converts a single u8 mulaw byte to 16-bit PCM signed int
function mulawToLinear(mulaw: number): number {
  mulaw = ~mulaw & 0xFF
  const sign = mulaw & 0x80
  const exponent = (mulaw >> 4) & 0x07
  const mantissa = mulaw & 0x0F
  let sample = ((mantissa << 1) + 33) << exponent
  sample -= 33
  return sign ? -sample : sample
}

// mulaw encoder — converts 16-bit PCM signed int to mulaw byte
function linearToMulaw(sample: number): number {
  const MULAW_MAX = 0x1FFF
  const MULAW_BIAS = 33
  const sign = (sample >> 8) & 0x80
  if (sign) sample = -sample
  if (sample > MULAW_MAX) sample = MULAW_MAX
  sample += MULAW_BIAS
  let exponent = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0F
  return ~(sign | (exponent << 4) | mantissa) & 0xFF
}

// Convert base64 mulaw buffer → base64 PCM Int16 buffer
function mulawB64ToPcmB64(mulawB64: string): string {
  const mulawBytes = Buffer.from(mulawB64, "base64")
  const pcm = Buffer.alloc(mulawBytes.length * 2)
  for (let i = 0; i < mulawBytes.length; i++) {
    const linear = mulawToLinear(mulawBytes[i])
    pcm.writeInt16LE(linear, i * 2)
  }
  return pcm.toString("base64")
}

// Convert base64 PCM Int16 buffer → base64 mulaw buffer
function pcmB64ToMulawB64(pcmB64: string): string {
  const pcm = Buffer.from(pcmB64, "base64")
  const mulaw = Buffer.alloc(pcm.length / 2)
  for (let i = 0; i < mulaw.length; i++) {
    const sample = pcm.readInt16LE(i * 2)
    mulaw[i] = linearToMulaw(sample)
  }
  return mulaw.toString("base64")
}

// Fetch a fresh client secret token from our own token endpoint
async function getClientSecret(appUrl: string): Promise<string> {
  const res = await fetch(`${appUrl}/api/grok-voice-token`, { method: "POST" })
  const data = await res.json() as { token?: string; error?: string }
  if (!data.token) throw new Error(data.error ?? "No token returned")
  return data.token
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const question = searchParams.get("question") ?? "How are you feeling today?"
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const apiKey   = process.env.XAI_API_KEY ?? ""

  if (!apiKey) {
    return new Response("XAI_API_KEY not set", { status: 500 })
  }

  // Next.js WebSocket upgrade — available in Node runtime
  const { socket, response } = (req as unknown as {
    socket: import("net").Socket
    response: Response
  })

  // @ts-expect-error — Next.js exposes the raw upgrade via headers in Node runtime
  const upgradeHeader = req.headers.get("upgrade")
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 })
  }

  // We need to use the raw Node.js server WebSocket upgrade mechanism.
  // In Next.js App Router Node runtime this is done via the server.on('upgrade') hook
  // which is not directly accessible here. Instead we use a custom WebSocket server
  // approach by reading the raw socket from the incoming request via a global WS server.

  // Since Next.js App Router does not natively support WS upgrade in route handlers,
  // we run a standalone ws server on a side port and proxy to it from TwiML.
  // The bridge logic runs in a server action / edge-incompatible API route.
  // For Vercel deployment this requires a separate Vercel Function with WS support.
  //
  // ─── APPROACH: Use Next.js custom server (server.ts) for WS bridge ───────────

  return new Response(
    JSON.stringify({ error: "Use /api/grok-phone-call/bridge-ws for WebSocket bridge" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

// Exported bridge logic — called from the custom Next.js server
export async function handleBridgeSocket(
  twilioWs: import("ws").WebSocket,
  question: string,
  appUrl: string
) {
  const apiKey = process.env.XAI_API_KEY ?? ""
  let callSid  = ""
  let streamSid = ""
  let grokReady = false
  const audioQueue: string[] = []

  // Get fresh ephemeral token
  let token: string
  try {
    token = await getClientSecret(appUrl)
  } catch (err) {
    twilioWs.close(1011, `Token error: ${(err as Error).message}`)
    return
  }

  // Open Grok Voice WebSocket
  const grokWs = new NodeWS(
    "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
    { headers: { "X-Client-Secret": `xai-client-secret.${token}` } }
  )

  // ── Grok WS handlers ───────────────────────────────────────────────────────
  grokWs.on("open", () => {
    // Configure session
    grokWs.send(JSON.stringify({
      type: "session.update",
      session: {
        voice: "Eve",
        instructions: `You are a warm, professional clinical AI assistant making an outbound phone call to a patient on behalf of their care team.
Greet the patient naturally, then ask them this one clinical question: "${question}"
Listen carefully to their full response. Say thank you and let them know their care team will follow up.
Keep the call brief — under 2 minutes total.`,
        turn_detection: null,
        input_audio_transcription: { model: "grok-2-audio" },
        audio: {
          input:  { format: { type: "audio/pcm", rate: 8000 } },
          output: { format: { type: "audio/pcm", rate: 8000 } },
        },
      },
    }))
  })

  grokWs.on("message", (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; session?: unknown; delta?: string; transcript?: string }

      switch (msg.type) {
        case "session.updated":
          grokReady = true
          // Flush buffered audio
          for (const chunk of audioQueue) {
            grokWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: chunk }))
          }
          audioQueue.length = 0
          // Trigger Grok to greet + ask the question
          grokWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "The patient just answered the phone. Please greet them and ask your question." }],
            },
          }))
          grokWs.send(JSON.stringify({ type: "response.create" }))
          break

        case "response.output_audio.delta": {
          // Grok is speaking — convert PCM → mulaw and send to Twilio
          if (!msg.delta || !streamSid) break
          const mulawB64 = pcmB64ToMulawB64(msg.delta)
          if (twilioWs.readyState === twilioWs.OPEN) {
            twilioWs.send(JSON.stringify({
              event: "media",
              streamSid,
              media: { payload: mulawB64 },
            }))
          }
          break
        }

        case "conversation.item.input_audio_transcription.completed": {
          // Patient finished speaking — store transcript
          const transcript = msg.transcript ?? ""
          if (callSid && transcript) {
            const existing = callEvents.get(callSid) ?? { status: "in-progress" }
            callEvents.set(callSid, { ...existing, transcript })
          }
          // After patient speaks, tell Grok to commit and respond
          grokWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
          grokWs.send(JSON.stringify({ type: "response.create" }))
          break
        }
      }
    } catch { /* ignore parse errors */ }
  })

  grokWs.on("close", () => {
    if (twilioWs.readyState === twilioWs.OPEN) twilioWs.close()
  })

  grokWs.on("error", (err) => {
    console.error("[v0] Grok WS error:", err.message)
  })

  // ── Twilio WS handlers ─────────────────────────────────────────────────────
  twilioWs.on("message", (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        event: string
        start?: { callSid: string; streamSid: string }
        media?: { payload: string }
      }

      switch (msg.event) {
        case "start":
          callSid   = msg.start?.callSid  ?? ""
          streamSid = msg.start?.streamSid ?? ""
          if (callSid) callEvents.set(callSid, { status: "answered" })
          break

        case "media": {
          const mulawB64 = msg.media?.payload
          if (!mulawB64) break
          const pcmB64 = mulawB64ToPcmB64(mulawB64)
          if (grokReady && grokWs.readyState === grokWs.OPEN) {
            grokWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcmB64 }))
          } else {
            audioQueue.push(pcmB64)
          }
          break
        }

        case "stop":
          if (callSid) {
            const existing = callEvents.get(callSid) ?? { status: "completed" }
            callEvents.set(callSid, { ...existing, status: "completed" })
          }
          grokWs.close()
          break
      }
    } catch { /* ignore */ }
  })

  twilioWs.on("close", () => {
    grokWs.close()
  })

  twilioWs.on("error", (err: Error) => {
    console.error("[v0] Twilio WS error:", err.message)
  })
}
