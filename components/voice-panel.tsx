"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Mic, Sparkles, CheckCircle, ChevronRight, Volume2, Loader2, Square, AlertCircle, ExternalLink, Send, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useGrokVoice } from "@/hooks/use-grok-voice"

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

const statusConfig: Record<string, { label: string; className: string }> = {
  connecting: {
    label: "Connecting to Grok Voice...",
    className: "border-blue-200 text-blue-700 bg-blue-50",
  },
  "speaking-question": {
    label: "Grok is speaking...",
    className: "border-amber-200 text-amber-700 bg-amber-50 animate-pulse",
  },
  listening: {
    label: "Listening to patient...",
    className: "border-red-200 text-red-700 bg-red-50",
  },
  thinking: {
    label: "Grok is thinking...",
    className: "border-primary/30 text-primary bg-primary/5 animate-pulse",
  },
  error: {
    label: "Error",
    className: "border-destructive/30 text-destructive bg-destructive/5",
  },
}

// Browser speech-to-text types
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string
  start(): void; stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
interface SpeechRecognitionEvent extends Event {
  results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } }
}

async function analyzeWithGrok(
  response: string,
  question: string,
  onChunk: (text: string) => void
) {
  const res = await fetch("/api/grok-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: response, context: { question } }),
  })
  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      onChunk(decoder.decode(value, { stream: true }))
    }
  }
}

function PromptCard({
  prompt,
  notEnabled,
  onResult,
}: {
  prompt: GapPrompt
  notEnabled: boolean
  onResult: (id: string) => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const [patientResponse, setPatientResponse] = useState("")
  const [grokAnalysis, setGrokAnalysis] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Fallback state (used when Grok Voice not enabled)
  const [fallbackActive, setFallbackActive] = useState(false)
  const [fallbackInput, setFallbackInput] = useState("")
  const [isListening, setIsListening] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const { status, transcript, error, startSession, stopListening, disconnect } = useGrokVoice()
  const isGrokActive = !notEnabled && status !== "idle" && status !== "error" && status !== "not-enabled"

  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  const handleSubmitFallback = useCallback(async () => {
    if (!fallbackInput.trim() || isAnalyzing) return
    recognitionRef.current?.stop()
    setIsListening(false)
    const response = fallbackInput.trim()
    setPatientResponse(response)
    setFallbackInput("")
    setSubmitted(true)
    setIsAnalyzing(true)
    let acc = ""
    try {
      await analyzeWithGrok(response, prompt.question, (chunk) => {
        acc += chunk
        setGrokAnalysis(acc)
      })
      onResult(prompt.id)
    } catch {
      setGrokAnalysis("Unable to analyze. Please try again.")
    } finally {
      setIsAnalyzing(false)
    }
  }, [fallbackInput, isAnalyzing, prompt.question, prompt.id, onResult])

  const toggleMic = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("Speech recognition not supported. Try Chrome."); return }
    const rec = new SR()
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US"
    recognitionRef.current = rec
    let final = ""
    rec.onresult = (e) => {
      let interim = ""
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " "
        else interim += e.results[i][0].transcript
      }
      setFallbackInput(final + interim)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    rec.start()
    setIsListening(true)
  }, [isListening])

  const handleAskPatient = useCallback(async () => {
    if (notEnabled) {
      setFallbackActive(true)
      setTimeout(() => textareaRef.current?.focus(), 50)
      return
    }
    await startSession(prompt.question, async (finalTranscript) => {
      if (!finalTranscript.trim()) return
      const response = finalTranscript.trim()
      setPatientResponse(response)
      setSubmitted(true)
      setIsAnalyzing(true)
      disconnect()
      let acc = ""
      try {
        await analyzeWithGrok(response, prompt.question, (chunk) => {
          acc += chunk
          setGrokAnalysis(acc)
        })
        onResult(prompt.id)
      } catch {
        setGrokAnalysis("Unable to analyze response. Please try again.")
      } finally {
        setIsAnalyzing(false)
      }
    })
  }, [notEnabled, prompt.question, prompt.id, startSession, disconnect, onResult])

  const cfg = !notEnabled && status !== "idle" && statusConfig[status] ? statusConfig[status] : null

  return (
    <div
      className={cn(
        "rounded-xl border p-4 flex flex-col gap-3 transition-all duration-300",
        isGrokActive ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">
            {prompt.tag}
          </Badge>
          {submitted && (
            <Badge variant="outline" className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50">
              <CheckCircle className="size-3 mr-1" />
              Added to Timeline
            </Badge>
          )}
        </div>

        {!isGrokActive && !fallbackActive && !submitted && (
          <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={handleAskPatient}>
            <Volume2 className="size-3 mr-1" />
            Ask Patient
          </Button>
        )}
      </div>

      {/* Question text */}
      <div className="flex gap-2">
        <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-3 text-primary" />
        </div>
        <p className="text-sm text-foreground leading-relaxed">{prompt.question}</p>
      </div>

      {/* Live Grok Voice status badge */}
      {cfg && (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className={cn("text-xs gap-1.5", cfg.className)}>
            {status === "listening" && (
              <span className="flex gap-0.5 items-end">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="inline-block w-0.5 rounded-full bg-red-500 animate-bounce"
                    style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 80}ms` }} />
                ))}
              </span>
            )}
            {(status === "connecting" || status === "thinking") && <Loader2 className="size-3 animate-spin" />}
            {status === "speaking-question" && <Volume2 className="size-3" />}
            {cfg.label}
          </Badge>
          {status === "listening" && (
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={stopListening}>
              <Square className="size-3" />
              Done Speaking
            </Button>
          )}
        </div>
      )}

      {/* Grok Voice error */}
      {!notEnabled && status === "error" && error && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">{error}</p>
          </div>
          {error.toLowerCase().includes("microphone access denied") && (
            <div className="flex flex-col gap-1.5 pl-6">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This preview runs inside an iframe which blocks microphone access. Open the app directly in its own tab to use Grok Voice.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => window.open(window.location.href, "_blank")}
                >
                  <ExternalLink className="size-3" />
                  Open in new tab
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFallbackActive(true)
                    setTimeout(() => textareaRef.current?.focus(), 50)
                  }}
                >
                  Use text instead
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Grok transcript */}
      {(status === "listening" || status === "thinking") && transcript && (
        <div className="rounded-lg bg-muted/60 px-3 py-2 border border-border/60">
          <p className="text-xs font-medium text-muted-foreground mb-1">Live transcript</p>
          <p className="text-sm text-foreground italic leading-relaxed">
            &ldquo;{transcript}&rdquo;
            {status === "listening" && <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />}
          </p>
        </div>
      )}

      {/* Fallback text + mic input */}
      {fallbackActive && !submitted && (
        <div className="mt-1 pt-3 border-t border-border/60 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              {isListening
                ? <><span className="flex gap-0.5 items-end">{[0,1,2,3].map(i => <span key={i} className="inline-block w-0.5 rounded-full bg-red-500 animate-bounce" style={{ height: `${6+i*3}px`, animationDelay: `${i*80}ms` }} />)}</span><span className="text-red-600 font-semibold">Listening...</span></>
                : <><Mic className="size-3" />Patient response</>
              }
            </p>
            <Button size="sm" variant={isListening ? "destructive" : "outline"} className="h-7 text-xs gap-1" onClick={toggleMic}>
              {isListening ? <><Square className="size-3" />Stop</> : <><Mic className="size-3" />Use Mic</>}
            </Button>
          </div>
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={fallbackInput}
              onChange={(e) => setFallbackInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitFallback() } }}
              placeholder={isListening ? "Speak now — transcribing..." : "Type or use mic..."}
              rows={2}
              className={cn(
                "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
                isListening ? "border-red-300 ring-2 ring-red-100" : "border-input"
              )}
            />
            <Button size="sm" onClick={handleSubmitFallback} disabled={!fallbackInput.trim() || isAnalyzing} className="self-end h-9">
              {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Press Enter or Send — Grok-4 will analyze the response</p>
        </div>
      )}

      {/* Final patient response */}
      {submitted && patientResponse && (
        <div className="flex gap-2 pt-2 border-t border-border/60">
          <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-accent/10">
            <Mic className="size-3 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Patient said:</p>
            <p className="text-sm text-foreground italic leading-relaxed">&ldquo;{patientResponse}&rdquo;</p>
          </div>
        </div>
      )}

      {/* Grok-4 clinical analysis stream */}
      {submitted && (isAnalyzing || grokAnalysis) && (
        <div className="flex gap-2 pt-2 border-t border-border/60">
          <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-3 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              Grok clinical analysis
              {isAnalyzing && (
                <span className="flex gap-0.5 items-end ml-1">
                  {[0,1,2].map((i) => <span key={i} className="inline-block w-0.5 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${i*100}ms` }} />)}
                </span>
              )}
            </p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {grokAnalysis}
              {isAnalyzing && <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export function VoicePanel() {
  const [addedFacts, setAddedFacts] = useState<Set<string>>(new Set())
  const [notEnabled, setNotEnabled] = useState(false)

  // Validate the xAI realtime connection once on mount
  useEffect(() => {
    fetch("/api/grok-realtime/validate", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) setNotEnabled(true)
      })
      .catch(() => setNotEnabled(true))
  }, [])

  const handleResult = useCallback((id: string) => {
    setAddedFacts((prev) => new Set([...prev, id]))
  }, [])

  return (
    <section className="py-16 px-6 bg-muted/40">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
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
            Real-time voice powered by{" "}
            <span className="font-medium text-foreground">grok-voice-latest</span> — speaks the question, listens to the patient, then analyzes with Grok
          </p>
        </div>

        <Card className="border border-primary/20 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Voice Interaction Session</CardTitle>
                <CardDescription>
                  Grok Voice identifies and resolves gaps in the patient&apos;s care record
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn("size-2 rounded-full", notEnabled ? "bg-amber-400" : "bg-emerald-500 animate-pulse")} />
                <span className="text-xs text-muted-foreground">
                  {notEnabled ? "Grok Voice — pending activation" : "grok-voice-latest ready"}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* How it works */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: <Volume2 className="size-4 text-primary" />, label: "1. Grok speaks", desc: "Question read aloud by grok-voice-latest" },
                { icon: <Mic className="size-4 text-red-500" />, label: "2. Patient responds", desc: "Mic opens automatically after question ends" },
                { icon: <Sparkles className="size-4 text-accent" />, label: "3. Grok analyzes", desc: "Clinical facts extracted in real time" },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted mx-auto mb-2">
                    {icon}
                  </div>
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            {/* Iframe mic restriction notice — shown when app is embedded in an iframe */}
            {!notEnabled && typeof window !== "undefined" && window.self !== window.top && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <Mic className="size-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">Microphone requires a direct browser tab</p>
                  <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                    This preview is embedded in an iframe. Chrome blocks microphone access in iframes. Open the app in its own tab to use Grok Voice fully — or use the text fallback below.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs gap-1.5 border-blue-300 text-blue-800 hover:bg-blue-100"
                    onClick={() => window.open(window.location.href, "_blank")}
                  >
                    <ExternalLink className="size-3" />
                    Open in new tab
                  </Button>
                </div>
              </div>
            )}

            {/* Not-enabled notice */}
            {notEnabled && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900">Grok Voice Agent not yet enabled on your xAI account</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    The realtime voice API requires activation. Until then, the cards below use browser mic + Grok-4 text analysis — the clinical intelligence still works.
                  </p>
                  <a
                    href="https://console.x.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline underline-offset-2 mt-1.5 hover:text-amber-900"
                  >
                    Enable at console.x.ai <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            )}

            <Separator className="mb-6" />

            {/* Gap cards */}
            <div className="flex flex-col gap-4">
              {gapPrompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} notEnabled={notEnabled} onResult={handleResult} />
              ))}
            </div>

            {/* Session summary */}
            {addedFacts.size > 0 && (
              <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="size-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">
                    {addedFacts.size} patient-reported fact{addedFacts.size > 1 ? "s" : ""} captured via Grok Voice
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-100 text-xs">
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
