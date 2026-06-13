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

// Mints a short-lived ephemeral session token for browser WebSocket connections.
// The browser connects via: new WebSocket(url, [`xai-client-secret.${token}`])
// Spec: POST /v1/realtime/client_secrets
export async function POST() {
  const apiKey = loadApiKey()
  if (!apiKey) {
    return Response.json({ error: "XAI_API_KEY is not configured" }, { status: 500 })
  }

  try {
    const res = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { seconds: 300 }, // 5 minutes
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error("[grok-voice-token] xAI error:", JSON.stringify(data))
      return Response.json(
        { error: "Failed to mint session token", detail: data },
        { status: res.status }
      )
    }

    // Spec response: { "value": "token-...", "expires_at": 1234567890 }
    const token: string = data.value
    const expiresAt: number = data.expires_at

    if (!token) {
      console.error("[grok-voice-token] unexpected response shape:", JSON.stringify(data))
      return Response.json({ error: "No token in response", detail: data }, { status: 500 })
    }

    return Response.json({ token, expiresAt })
  } catch (err) {
    console.error("[grok-voice-token] fetch error:", err)
    return Response.json({ error: "Network error contacting xAI" }, { status: 500 })
  }
}
