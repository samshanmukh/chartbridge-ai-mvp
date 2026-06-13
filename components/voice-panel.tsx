"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Mic, Sparkles, CheckCircle, ChevronRight, Volume2, Send, Loader2, MicOff, Square } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Web Speech API type declarations ──────────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
// ──────────────────────────────────────────────────────────────────────────────

function speakText(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.pitch = 1
  utterance.volume = 1
  if (onEnd) utterance.onend = onEnd
  window.speechSynthesis.speak(utterance)
}

interface GapPrompt {
  id: string
  question: string
  tag: string
}

const gapPrompts: GapPrompt[] = [
  {
    id: "metformin",
    question:
      "Your records show Metformin was prescribed in March, but there is no refill after April. Are you still taking it?",
    tag: "Medication Gap",
  },
  {
    id: "followup",
    question:
      "We see your A1C was 8.2% in February. Did you schedule a follow-up appointment with your endocrinologist?",
    tag: "Care Gap",
  },
  {
    id: "glucose",
    question:
      "Your wearable shows elevated glucose readings in the evenings over the past 3 weeks. Have you made any dietary changes?",
    tag: "Wearable Alert",
  },
]

function PromptCard({
  prompt,
  onResult,
}: {
  prompt: GapPrompt
  onResult: (id: string) => void
}) {
  const [patientInput, setPatientInput] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [patientResponse, setPatientResponse] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [analysis, setAnalysis] = useState("")
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  const startListening = useCallback(() => {
    setVoiceError("")
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError("Speech recognition is not supported in this browser. Try Chrome.")
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"
    recognitionRef.current = recognition

    let finalTranscript = ""

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ""
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " "
        } else {
          interimTranscript += result[0].transcript
        }
      }
      setPatientInput(finalTranscript + interimTranscript)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        setVoiceError(`Mic error: ${event.error}. Please check microphone permissions.`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const handleAskPatient = useCallback(() => {
    setIsActive(true)
    setIsSpeaking(true)
    speakText(prompt.question, () => {
      setIsSpeaking(false)
      // Auto-start mic after question finishes speaking
      setTimeout(() => {
        startListening()
        textareaRef.current?.focus()
      }, 300)
    })
  }, [prompt.question, startListening])

  const handleSubmit = async () => {
    if (!patientInput.trim() || isStreaming) return
    stopListening()
    const response = patientInput.trim()
    setPatientResponse(response)
    setSubmitted(true)
    setPatientInput("")
    setIsStreaming(true)
    setAnalysis("")

    try {
      const res = await fetch("/api/grok-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: response,
          context: { question: prompt.question },
        }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          setAnalysis((prev) => prev + chunk)
        }
      }
    } catch (err) {
      setAnalysis("Unable to connect to Grok. Please check your API key and try again.")
    } finally {
      setIsStreaming(false)
      onResult(prompt.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-300",
        isActive ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="text-xs border-primary/20 text-primary bg-primary/5 shrink-0"
          >
            {prompt.tag}
          </Badge>
          {submitted && !isStreaming && analysis && (
            <Badge
              variant="outline"
              className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50"
            >
              <CheckCircle className="size-3 mr-1" />
              Added to Timeline
            </Badge>
          )}
        </div>
        {!isActive && !submitted && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 shrink-0"
            onClick={handleAskPatient}
          >
            <Volume2 className="size-3 mr-1" />
            Ask Patient
          </Button>
        )}
        {isSpeaking && (
          <Badge variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50 animate-pulse shrink-0">
            <Volume2 className="size-3 mr-1" />
            Speaking...
          </Badge>
        )}
      </div>

      {/* Grok question */}
      <div className="flex gap-2 mb-3">
        <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-3 text-primary" />
        </div>
        <p className="text-sm text-foreground leading-relaxed">{prompt.question}</p>
      </div>

      {/* Patient input */}
      {isActive && !submitted && (
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              {isListening ? (
                <>
                  <span className="flex gap-0.5 items-end">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="inline-block w-0.5 rounded-full bg-red-500 animate-bounce"
                        style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 80}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-red-600 font-semibold">Listening...</span>
                </>
              ) : (
                <>
                  <Mic className="size-3" />
                  Patient response:
                </>
              )}
            </p>
            {/* Mic toggle button */}
            <Button
              size="sm"
              variant={isListening ? "destructive" : "outline"}
              className="h-7 text-xs gap-1"
              onClick={isListening ? stopListening : startListening}
              disabled={isSpeaking}
            >
              {isListening ? (
                <>
                  <Square className="size-3" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="size-3" />
                  Use Mic
                </>
              )}
            </Button>
          </div>
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={patientInput}
              onChange={(e) => setPatientInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Speak now — transcribing..." : "Type or use mic to capture patient response..."}
              rows={2}
              className={cn(
                "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
                isListening ? "border-red-300 ring-2 ring-red-100" : "border-input"
              )}
            />
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!patientInput.trim() || isStreaming}
              className="self-end h-9"
            >
              {isStreaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
          {voiceError && (
            <p className="text-xs text-destructive mt-1">{voiceError}</p>
          )}
          {!voiceError && (
            <p className="text-xs text-muted-foreground mt-1">
              {isListening ? "Click Stop when done, then Send to analyze" : "Press Enter or Send to submit to Grok"}
            </p>
          )}
        </div>
      )}

      {/* Patient spoken response */}
      {submitted && patientResponse && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
          <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-accent/10">
            <Mic className="size-3 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Patient said:</p>
            <p className="text-sm text-foreground italic leading-relaxed">
              &ldquo;{patientResponse}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Grok streaming analysis */}
      {submitted && (isStreaming || analysis) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
          <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-3 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              Grok Voice analysis
              {isStreaming && (
                <span className="flex gap-0.5 items-end ml-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block w-0.5 h-2 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 100}ms` }}
                    />
                  ))}
                </span>
              )}
            </p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {analysis}
              {isStreaming && (
                <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export function VoicePanel() {
  const [addedFacts, setAddedFacts] = useState<Set<string>>(new Set())

  const handleResult = (id: string) => {
    setAddedFacts((prev) => new Set([...prev, id]))
  }

  return (
    <section className="py-16 px-6 bg-muted/40">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-1 mb-8">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
              <Mic className="size-3.5 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Grok Voice Gap Resolution</h2>
            <Badge className="bg-primary/10 text-primary border-0 ml-1">
              <Sparkles className="size-3 mr-1" />
              Live AI
            </Badge>
          </div>
          <p className="text-muted-foreground pl-9">
            Ask the patient to clarify missing history — Grok analyzes responses in real time
          </p>
        </div>

        <Card className="border border-primary/20 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Voice Interaction Session</CardTitle>
                <CardDescription>
                  Grok Voice is identifying gaps in Maria&apos;s care record
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">Grok Connected</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Mic indicator */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-4">
                <div className="flex size-20 items-center justify-center rounded-full border-4 bg-primary border-primary/30 shadow-lg shadow-primary/20">
                  <Mic className="size-8 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">
                Powered by xAI Grok via Vercel AI Gateway
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click &ldquo;Ask Patient&rdquo; — the question plays aloud, then the mic opens for the patient to speak
              </p>
            </div>

            <Separator className="mb-6" />

            <div className="flex flex-col gap-3">
              {gapPrompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} onResult={handleResult} />
              ))}
            </div>

            {addedFacts.size > 0 && (
              <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="size-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">
                    {addedFacts.size} patient-reported fact{addedFacts.size > 1 ? "s" : ""} analyzed by Grok
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-700 hover:bg-emerald-100 text-xs"
                >
                  View Timeline <ChevronRight className="size-3 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
