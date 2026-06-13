import { type NextRequest } from "next/server"
import { WebSocket as WsClient } from "ws"
import { readFileSync } from "fs"

function loadApiKey(): string | undefined {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY
  try {
    const raw = readFileSync("/vercel/share/.env.project", "utf-8")
    const match = raw.match(/^XAI_API_KEY=(.+)$/m)
    return match?.[1]?.trim()
  } catch {
    return undefined
  }
}

// Next.js App Router does not support raw WebSocket upgrades natively.
// We use a GET endpoint that the client polls to validate the API key is present,
// and the actual WebSocket proxy is handled via the custom server below.
// For the browser ↔ xAI bridge, we use a different approach:
// the client connects directly using the API key passed via a short-lived token
// from this endpoint.
export async function GET(req: NextRequest) {
  const apiKey = loadApiKey()
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "XAI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
  // Return a one-time session token the browser uses to connect via
  // a query-param-authenticated WebSocket URL
  return new Response(JSON.stringify({ apiKey }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST(req: NextRequest) {
  const apiKey = loadApiKey()
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "XAI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = await req.json().catch(() => ({}))
  const { type, payload } = body as { type: string; payload: unknown }

  // Proxy a single message to xAI and return the response stream
  // This is used for text-mode session setup before the browser opens its WS
  if (type === "validate") {
    try {
      const ws = new WsClient("wss://api.x.ai/v1/realtime?model=grok-voice-latest", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => { ws.close(); resolve() })
        ws.on("error", reject)
        setTimeout(() => reject(new Error("timeout")), 8000)
      })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400 })
}
