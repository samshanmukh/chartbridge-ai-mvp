// xAI Grok client (OpenAI-compatible). All helpers degrade gracefully: if
// XAI_API_KEY is absent or the call fails, callers fall back to deterministic
// output derived from the real FHIR data, so the demo never hard-fails.
import "server-only";
import OpenAI from "openai";
import { XAI_BASE_URL, GROK_MODEL, hasGrok } from "./config";

let client: OpenAI | null = null;
function grok(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: XAI_BASE_URL,
    });
  }
  return client;
}

export function grokAvailable(): boolean {
  return hasGrok();
}

/** Strict-JSON completion with a typed fallback. Returns { value, source }. */
export async function grokJSON<T>(
  system: string,
  user: string,
  fallback: T
): Promise<{ value: T; source: "grok" | "fallback" }> {
  if (!hasGrok()) return { value: fallback, source: "fallback" };
  try {
    const res = await grok().chat.completions.create({
      model: GROK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const text = res.choices[0]?.message?.content ?? "";
    return { value: JSON.parse(text) as T, source: "grok" };
  } catch (err) {
    console.warn("[grok] JSON completion failed, using fallback:", err);
    return { value: fallback, source: "fallback" };
  }
}

/** Plain text completion (e.g. for narrative prose). */
export async function grokText(
  system: string,
  user: string,
  fallback: string
): Promise<{ value: string; source: "grok" | "fallback" }> {
  if (!hasGrok()) return { value: fallback, source: "fallback" };
  try {
    const res = await grok().chat.completions.create({
      model: GROK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    });
    return {
      value: res.choices[0]?.message?.content ?? fallback,
      source: "grok",
    };
  } catch (err) {
    console.warn("[grok] text completion failed, using fallback:", err);
    return { value: fallback, source: "fallback" };
  }
}
