import { streamText } from "ai"

export async function POST(req: Request) {
  const { prompt, context } = await req.json()

  const result = streamText({
    model: "xai/grok-4.1-fast-non-reasoning",
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

  return result.toUIMessageStreamResponse()
}
