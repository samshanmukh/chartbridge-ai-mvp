import { streamText } from "ai"
import { createXai } from "@ai-sdk/xai"
import { readFileSync } from "fs"

function loadApiKey(): string | undefined {
  // Try process.env first (works after server restart)
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY
  // Fall back to reading shared env file directly (works before restart)
  try {
    const raw = readFileSync("/vercel/share/.env.project", "utf-8")
    const match = raw.match(/^XAI_API_KEY=(.+)$/m)
    return match?.[1]?.trim()
  } catch {
    return undefined
  }
}

export async function POST(req: Request) {
  const { prompt, context } = await req.json()

  const apiKey = loadApiKey()
  if (!apiKey) {
    return new Response("XAI_API_KEY is not configured", { status: 500 })
  }

  const xai = createXai({ apiKey })

  const result = streamText({
    model: xai("grok-4"),

    system: `You are Grok Voice, an AI assistant embedded in ChartBridge — a healthcare patient data reconciliation platform.
Your role is to interpret a patient's spoken response to a clinical gap question and extract key medical facts.

Given the gap question asked and the patient's spoken response, you must:
1. Briefly confirm the key fact the patient reported (1 sentence).
2. Summarize the new clinical insight in plain, empathetic language (1-2 sentences).
3. Suggest what should be added to the patient's care timeline as a new fact (1 sentence starting with "Timeline fact:").

Be concise, warm, and clinically accurate. Do not diagnose. Do not make up information.`,
    messages: [
      {
        role: "user",
        content: `Gap question asked to patient: "${context.question}"

Patient's spoken response: "${prompt}"

Please extract the key medical fact and summarize it for the care timeline.`,
      },
    ],
  })

  return result.toTextStreamResponse()
}
