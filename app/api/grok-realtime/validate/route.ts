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

export async function POST() {
  const apiKey = loadApiKey()
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "XAI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const ws = new WsClient("wss://api.x.ai/v1/realtime?model=grok-voice-latest", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => { ws.close(); resolve() })
      ws.on("error", (err) => reject(err))
      setTimeout(() => reject(new Error("Connection timeout")), 8000)
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
