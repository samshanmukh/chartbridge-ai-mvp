"use client"

import { useState, useRef, useCallback } from "react"

export type GrokVoiceStatus =
  | "idle"
  | "connecting"
  | "speaking-question"  // Grok is speaking the gap question to the patient
  | "listening"          // Mic is open, patient is speaking
  | "thinking"           // Grok is processing
  | "error"

const SAMPLE_RATE = 24000

// Convert Float32Array mic data → base64 PCM16
function float32ToBase64PCM16(float32Array: Float32Array): string {
  const pcm16 = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(pcm16.buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Convert base64 PCM16 → Float32Array for AudioContext playback
function base64PCM16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const pcm16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(pcm16.length)
  for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0
  return float32
}

export interface UseGrokVoiceReturn {
  status: GrokVoiceStatus
  transcript: string      // Patient's speech transcript (from Grok)
  error: string
  startSession: (question: string, onTranscript: (text: string) => void) => Promise<void>
  stopListening: () => void
  disconnect: () => void
}

export function useGrokVoice(): UseGrokVoiceReturn {
  const [status, setStatus] = useState<GrokVoiceStatus>("idle")
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")

  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<Float32Array[]>([])
  const isPlayingRef = useRef(false)
  const onTranscriptRef = useRef<((text: string) => void) | null>(null)
  const accTranscriptRef = useRef("")

  const disconnect = useCallback(() => {
    processorRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current?.close()
    wsRef.current?.close()

    processorRef.current = null
    sourceNodeRef.current = null
    streamRef.current = null
    audioCtxRef.current = null
    wsRef.current = null
    audioQueueRef.current = []
    isPlayingRef.current = false
    accTranscriptRef.current = ""
    setStatus("idle")
    setTranscript("")
  }, [])

  // Plays the audio queue sequentially via AudioContext
  const playNextChunk = useCallback(() => {
    if (!audioCtxRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      return
    }
    isPlayingRef.current = true
    const samples = audioQueueRef.current.shift()!
    const buffer = audioCtxRef.current.createBuffer(1, samples.length, SAMPLE_RATE)
    buffer.copyToChannel(samples, 0)
    const src = audioCtxRef.current.createBufferSource()
    src.buffer = buffer
    src.connect(audioCtxRef.current.destination)
    src.onended = playNextChunk
    src.start()
  }, [])

  const enqueueAudio = useCallback((base64: string) => {
    const samples = base64PCM16ToFloat32(base64)
    audioQueueRef.current.push(samples)
    if (!isPlayingRef.current) playNextChunk()
  }, [playNextChunk])

  const startMicStreaming = useCallback(async () => {
    if (!wsRef.current || !audioCtxRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream

    const source = audioCtxRef.current.createMediaStreamSource(stream)
    sourceNodeRef.current = source

    // ScriptProcessor is deprecated but has the widest browser support for raw PCM access
    const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      const pcm = float32ToBase64PCM16(e.inputBuffer.getChannelData(0))
      wsRef.current.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: pcm,
      }))
    }

    source.connect(processor)
    processor.connect(audioCtxRef.current.destination)
    setStatus("listening")
  }, [])

  const startSession = useCallback(async (
    question: string,
    onTranscript: (text: string) => void
  ) => {
    onTranscriptRef.current = onTranscript
    accTranscriptRef.current = ""
    setTranscript("")
    setError("")
    setStatus("connecting")

    // 1. Get ephemeral token from our server
    let token: string
    try {
      const res = await fetch("/api/grok-voice-token", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.token) throw new Error(data.error ?? "No token returned")
      token = data.token
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not get Grok Voice token: ${msg}`)
      setStatus("error")
      return
    }

    // 2. Open AudioContext
    audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })

    // 3. Connect to Grok Voice WebSocket via ephemeral token in the protocol field
    const ws = new WebSocket(
      "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
      [`xai-client-secret.${token}`]
    )
    wsRef.current = ws

    ws.onopen = () => {
      // Configure the Grok voice session
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "ara",
          instructions: `You are Grok Voice, a warm clinical AI assistant embedded in ChartBridge — a patient data reconciliation platform.
Your role is to ask the patient a single specific clinical question and listen carefully to their response.
After they answer, briefly acknowledge what they said in a warm, empathetic tone (1-2 sentences max).
Do NOT ask follow-up questions. Do NOT diagnose. Stay focused on the one question.
The question to ask the patient is: "${question}"`,
          turn_detection: { type: "server_vad" },
          audio: {
            input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
            output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
          },
        },
      }))

      // Trigger Grok to speak the question first
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

    ws.onmessage = async (event) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      switch (msg.type) {
        // Grok is speaking — play the audio chunk
        case "response.audio.delta": {
          enqueueAudio(msg.delta as string)
          break
        }

        // Grok finished speaking — open the mic for the patient
        case "response.audio.done": {
          // Small delay so last audio chunk finishes playing
          setTimeout(async () => {
            try {
              await startMicStreaming()
            } catch {
              setError("Microphone access denied. Please allow mic access and try again.")
              setStatus("error")
            }
          }, 600)
          break
        }

        // Live transcript of patient speech
        case "conversation.item.input_audio_transcription.delta": {
          accTranscriptRef.current += (msg.delta as string) ?? ""
          setTranscript(accTranscriptRef.current)
          break
        }

        // Final transcript
        case "conversation.item.input_audio_transcription.completed": {
          const final = (msg.transcript as string) ?? accTranscriptRef.current
          accTranscriptRef.current = final
          setTranscript(final)
          onTranscriptRef.current?.(final)
          // Stop mic — patient finished speaking
          processorRef.current?.disconnect()
          sourceNodeRef.current?.disconnect()
          streamRef.current?.getTracks().forEach((t) => t.stop())
          setStatus("thinking")
          break
        }

        case "error": {
          const errMsg = (msg.error as { message?: string })?.message ?? "Grok Voice error"
          setError(errMsg)
          setStatus("error")
          break
        }
      }
    }

    ws.onerror = () => {
      setError("WebSocket connection to Grok Voice failed.")
      setStatus("error")
    }

    ws.onclose = () => {
      if (status !== "error") setStatus("idle")
    }
  }, [enqueueAudio, startMicStreaming, status])

  const stopListening = useCallback(() => {
    processorRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setStatus("thinking")
  }, [])

  return { status, transcript, error, startSession, stopListening, disconnect }
}
