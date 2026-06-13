"use client"

/**
 * useGrokVoice — xAI Realtime Voice Agent hook
 *
 * Spec-compliant implementation following the official xAI Voice Agent guide.
 * Key architectural decisions:
 * - Ephemeral token via POST /v1/realtime/client_secrets (subprotocol auth)
 * - AudioWorklet (pcm-processor) instead of deprecated ScriptProcessorNode
 * - AudioContext created inside the click handler (Safari autoplay policy)
 * - Mic capture starts in parallel with WebSocket connect
 * - Audio buffered until session.updated, then flushed in order
 * - Gapless playback via nextPlayTime scheduling on AudioContext timeline
 * - Chunked base64 encoding to avoid stack overflow on large buffers
 * - Interruption: speech_started → stop playback + response.cancel
 * - Token auto-refresh ~5s before expiry
 */

import { useState, useRef, useCallback } from "react"

export type GrokVoiceStatus =
  | "idle"
  | "connecting"
  | "speaking-question"
  | "listening"
  | "thinking"
  | "error"

const SAMPLE_RATE = 24000

// ── Audio helpers ──────────────────────────────────────────────────────────────

/** Chunked base64 — avoids stack overflow on large Int16Array buffers */
function audioToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength)
  const CHUNK = 0x2000 // 8 KiB
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK))))
  }
  return btoa(parts.join(""))
}

/** Decode base64 PCM16 → Float32 for AudioContext playback */
function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0
  return float32
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseGrokVoiceReturn {
  status: GrokVoiceStatus
  transcript: string
  error: string
  startSession: (question: string, onTranscript: (text: string) => void) => Promise<void>
  stopListening: () => void
  disconnect: () => void
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useGrokVoice(): UseGrokVoiceReturn {
  const [status, setStatus] = useState<GrokVoiceStatus>("idle")
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null)
  const intentionalDisconnectRef = useRef(false)

  // AudioContext + playback
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const queuedSourcesRef = useRef<AudioBufferSourceNode[]>([])

  // Mic capture (AudioWorklet)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Mic buffer — holds chunks until session.updated
  const micBufferRef = useRef<Int16Array[]>([])
  const isSessionReadyRef = useRef(false)

  // Transcript accumulator
  const accTranscriptRef = useRef("")
  const onTranscriptRef = useRef<((text: string) => void) | null>(null)

  // Token refresh
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Playback ─────────────────────────────────────────────────────────────────

  const interruptPlayback = useCallback(() => {
    for (const src of queuedSourcesRef.current) {
      try { src.stop() } catch { /* already stopped */ }
    }
    queuedSourcesRef.current = []
    nextPlayTimeRef.current = 0
  }, [])

  const playPcmChunk = useCallback((base64: string) => {
    const ctx = audioCtxRef.current
    if (!ctx) return

    const float32 = base64ToFloat32(base64)
    const buf = ctx.createBuffer(1, float32.length, SAMPLE_RATE)
    buf.getChannelData(0).set(float32)

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)

    const now = ctx.currentTime
    const startAt = Math.max(now, nextPlayTimeRef.current)
    src.start(startAt)
    nextPlayTimeRef.current = startAt + buf.duration

    queuedSourcesRef.current.push(src)
    src.onended = () => {
      const idx = queuedSourcesRef.current.indexOf(src)
      if (idx !== -1) queuedSourcesRef.current.splice(idx, 1)
    }
  }, [])

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  const cleanupMic = useCallback(() => {
    workletNodeRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    workletNodeRef.current = null
    sourceNodeRef.current = null
    streamRef.current = null
  }, [])

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current)

    cleanupMic()
    interruptPlayback()
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    wsRef.current?.close()
    wsRef.current = null

    micBufferRef.current = []
    isSessionReadyRef.current = false
    accTranscriptRef.current = ""
    nextPlayTimeRef.current = 0

    setStatus("idle")
    setTranscript("")
  }, [cleanupMic, interruptPlayback])

  // ── Session token ─────────────────────────────────────────────────────────────

  const fetchToken = useCallback(async (): Promise<{ token: string; expiresAt: number }> => {
    const res = await fetch("/api/grok-voice-token", { method: "POST" })
    const data = await res.json()
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? "Failed to mint session token")
    }
    return { token: data.token, expiresAt: data.expiresAt }
  }, [])

  // ── Main session start ────────────────────────────────────────────────────────

  const startSession = useCallback(async (
    question: string,
    onTranscript: (text: string) => void,
  ) => {
    onTranscriptRef.current = onTranscript
    accTranscriptRef.current = ""
    micBufferRef.current = []
    isSessionReadyRef.current = false
    intentionalDisconnectRef.current = false

    setTranscript("")
    setError("")
    setStatus("connecting")

    // ── Step 1: AudioContext warmup FIRST (Safari autoplay policy requires
    //    AudioContext creation inside a synchronous user-gesture handler,
    //    before any awaits that might cross a task boundary) ──────────────
    const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
    if (audioCtx.state === "suspended") await audioCtx.resume()
    audioCtxRef.current = audioCtx

    // ── Step 2: Mint ephemeral session token ──────────────────────────────
    let token: string
    let expiresAt: number
    try {
      ;({ token, expiresAt } = await fetchToken())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus("error")
      audioCtx.close()
      audioCtxRef.current = null
      return
    }

    // Schedule token refresh ~5s before expiry
    const msUntilExpiry = expiresAt * 1000 - Date.now() - 5000
    if (msUntilExpiry > 0) {
      tokenRefreshTimerRef.current = setTimeout(async () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        try {
          const { token: newToken } = await fetchToken()
          // Send updated token to session (if xAI supports mid-session refresh)
          wsRef.current.send(JSON.stringify({
            type: "session.update",
            session: { client_secret: newToken },
          }))
        } catch { /* best-effort */ }
      }, msUntilExpiry)
    }

    // ── Step 3: Start mic capture IN PARALLEL with WebSocket connect ──────
    //    Do NOT await the WebSocket open before capturing audio.
    let micStarted = false
    const startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: SAMPLE_RATE,
          },
        })
        streamRef.current = stream

        await audioCtx.audioWorklet.addModule("/pcm-processor-worklet.js")

        const source = audioCtx.createMediaStreamSource(stream)
        sourceNodeRef.current = source

        const worklet = new AudioWorkletNode(audioCtx, "pcm-processor")
        workletNodeRef.current = worklet

        worklet.port.onmessage = (e: MessageEvent<Int16Array>) => {
          const int16 = e.data
          const ws = wsRef.current

          if (isSessionReadyRef.current && ws?.readyState === WebSocket.OPEN) {
            // Live streaming
            ws.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: audioToBase64(int16),
            }))
          } else {
            // Buffer until session.updated — cap at ~10s
            const totalSamples = micBufferRef.current.reduce((s, c) => s + c.length, 0)
            if (totalSamples < SAMPLE_RATE * 10) {
              micBufferRef.current.push(int16)
            }
          }
        }

        source.connect(worklet)
        // worklet has no audio output — do NOT connect to destination
        micStarted = true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          setError("Microphone access denied — check browser permissions")
        } else if (msg.includes("NotFoundError")) {
          setError("No microphone found")
        } else {
          setError(`Mic error: ${msg}`)
        }
        setStatus("error")
      }
    }

    // ── Step 4: Open WebSocket (in parallel with mic) ─────────────────────
    const ws = new WebSocket(
      "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
      [`xai-client-secret.${token}`]
    )
    wsRef.current = ws

    // Start mic and WS concurrently
    const micPromise = startMic()

    // Connection timeout — 10 seconds
    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        setError("Connection timed out — could not reach Grok Voice")
        setStatus("error")
        ws.close()
      }
    }, 10000)

    ws.onopen = () => {
      clearTimeout(connectTimeout)

      // Send session config
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "Eve",
          instructions: `You are Grok Voice, a warm and professional clinical AI assistant embedded in ChartBridge — a patient data reconciliation platform.
Your role is to ask the patient one specific clinical question and listen carefully to their response.
Start by asking the question immediately. After they answer, briefly acknowledge what they said in 1-2 warm sentences.
Do NOT ask follow-up questions. Do NOT diagnose. Stay focused on this single question.
The question to ask is: "${question}"`,
          turn_detection: { type: "server_vad" },
          input_audio_transcription: { model: "grok-2-audio" },
          audio: {
            input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
            output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
          },
        },
      }))
    }

    ws.onmessage = async ({ data }) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(data as string) } catch { return }

      switch (msg.type) {

        case "session.updated": {
          // Session config acknowledged — flush buffered mic audio and go live
          if (!isSessionReadyRef.current) {
            isSessionReadyRef.current = true

            // Wait for mic to be ready before flushing
            await micPromise

            if (!micStarted) return // mic failed — already set error

            // Flush buffered audio in chronological order
            for (const chunk of micBufferRef.current) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "input_audio_buffer.append",
                  audio: audioToBase64(chunk),
                }))
              }
            }
            micBufferRef.current = []

            // Trigger Grok to speak the question
            ws.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "Please ask me your question now." }],
              },
            }))
            ws.send(JSON.stringify({ type: "response.create" }))
            setStatus("speaking-question")
          }
          break
        }

        // User started speaking — interrupt Grok immediately
        case "input_audio_buffer.speech_started": {
          interruptPlayback()
          ws.send(JSON.stringify({ type: "response.cancel" }))
          setStatus("listening")
          break
        }

        case "input_audio_buffer.speech_stopped": {
          setStatus("thinking")
          break
        }

        // Grok speaking — play audio chunk (gapless scheduled playback)
        case "response.output_audio.delta": {
          playPcmChunk(msg.delta as string)
          break
        }

        // Grok finished its turn — patient can now speak
        case "response.output_audio.done": {
          setStatus("listening")
          break
        }

        // Live transcript of patient speech
        case "conversation.item.input_audio_transcription.delta": {
          accTranscriptRef.current += (msg.delta as string) ?? ""
          setTranscript(accTranscriptRef.current)
          break
        }

        // Final patient transcript — hand off to Grok-4 clinical analysis
        case "conversation.item.input_audio_transcription.completed": {
          const final = (msg.transcript as string) ?? accTranscriptRef.current
          accTranscriptRef.current = final
          setTranscript(final)
          if (final.trim()) {
            onTranscriptRef.current?.(final)
          }
          cleanupMic()
          setStatus("thinking")
          break
        }

        case "error": {
          const errMsg = (msg.error as { message?: string })?.message ?? "Grok Voice error"
          console.error("[useGrokVoice] error event:", errMsg)
          setError(errMsg)
          setStatus("error")
          break
        }
      }
    }

    ws.onerror = (e) => {
      console.error("[useGrokVoice] WebSocket error:", e)
      if (!intentionalDisconnectRef.current) {
        setError("Connection to Grok Voice failed — check your API key and try again")
        setStatus("error")
      }
    }

    ws.onclose = () => {
      clearTimeout(connectTimeout)
      if (!intentionalDisconnectRef.current) {
        setStatus((prev) => prev === "error" ? "error" : "idle")
      }
    }
  }, [fetchToken, cleanupMic, interruptPlayback, playPcmChunk])

  // ── stopListening ────────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    cleanupMic()
    isSessionReadyRef.current = false
    setStatus("thinking")
  }, [cleanupMic])

  return { status, transcript, error, startSession, stopListening, disconnect }
}
