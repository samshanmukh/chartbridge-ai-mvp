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
    return Response.json({ error: "XAI_API_KEY is not configured" }, { status: 500 })
  }

  try {
    const res = await fetch("https://api.x.ai/v1/realtime/ephemeral-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-voice-latest",
        expires_in: 600, // 10 minutes
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("[v0] Ephemeral token error:", err)
      return Response.json({ error: "Failed to get ephemeral token", detail: err }, { status: res.status })
    }

    const data = await res.json()
    return Response.json({ token: data.client_secret ?? data.token ?? data })
  } catch (err) {
    console.error("[v0] Ephemeral token fetch error:", err)
    return Response.json({ error: "Network error fetching ephemeral token" }, { status: 500 })
  }
}
