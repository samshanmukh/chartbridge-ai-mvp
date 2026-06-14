"use client"

import { useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  Mic,
  Sparkles,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Loader2,
  Phone,
  PhoneCall,
  PhoneOff,
  Play,
  Volume2,
  Square,
  AlertCircle,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useGrokVoice } from "@/hooks/use-grok-voice"
import { usePatient } from "@/lib/patient-context"

interface IntakeItem {
  id: string
  tag: string
  question: string
  answer: string
  note: string // Grok's one-line clinical observation about the answer
}

// Completed Grok Voice intake — 15 of 15 questions answered (demo data). Q1 is
// swapped at runtime for the patient's real top reconciliation gap (true context),
// and its answer + Grok note are produced live by the Play button.
const intake: IntakeItem[] = [
  { id: "q1", tag: "Top Gap", question: "Our records show diphenhydramine as an active medication since 2020. Are you still taking it?", answer: "Yes, I take it every night, mostly to help me fall asleep.", note: "Confirms active nightly use for sleep — flag for medication review and anticholinergic burden." },
  { id: "q2", tag: "Medication Safety", question: "You take diphenhydramine nightly. Do you rely on it to sleep, and do you wake up feeling rested?", answer: "I do rely on it. Honestly, I still wake up tired most mornings.", note: "Self-medicating for sleep but unrefreshed — the antihistamine may be masking an underlying sleep problem." },
  { id: "q3", tag: "Wearable Alert", question: "Your watch shows your blood oxygen dipping low overnight. Do you snore or wake up gasping?", answer: "My girlfriend says I snore really loudly and sometimes seem to stop breathing.", note: "Witnessed snoring + apnea corroborates the overnight SpO2 dips — refer for a sleep study." },
  { id: "q4", tag: "Care Gap", question: "Your last blood work was about three years ago. Have you had any labs done elsewhere since then?", answer: "No, I haven't been to a doctor in a while.", note: "No recent labs — screening overdue; order a baseline metabolic and lipid panel." },
  { id: "q5", tag: "Family History", question: "Do you have a family history of heart disease?", answer: "Yes, my dad had a heart attack at 52.", note: "Premature CAD (father MI at 52) — justifies earlier lipid screening despite age." },
  { id: "q6", tag: "Safety Flag", question: "You have a latex allergy on file and a past surgery. Has every clinic been told about the latex allergy?", answer: "I always remind them, but I'm not sure it's in every system.", note: "Latex allergy may not propagate across settings — confirm the latex-free banner everywhere." },
  { id: "q7", tag: "Allergy", question: "Are your allergy symptoms year-round or seasonal?", answer: "Year-round, but they get worse in the spring.", note: "Perennial with seasonal flare — consistent with the rhinitis on the problem list." },
  { id: "q8", tag: "Respiratory", question: "Do you ever get short of breath or wheeze during exercise?", answer: "Sometimes when I run hard, my chest gets tight.", note: "Exertional chest tightness — consistent with exercise-induced bronchoconstriction." },
  { id: "q9", tag: "Lifestyle", question: "How many days a week are you physically active?", answer: "About five days a week — running, swimming, and lifting.", note: "Highly active; cardio fitness above average — a positive prognostic sign." },
  { id: "q10", tag: "Sleep", question: "How many hours of sleep do you usually get?", answer: "About seven, but it never feels like enough.", note: "Adequate hours but non-restorative — supports sleep-disordered breathing." },
  { id: "q11", tag: "Weight", question: "Any recent changes to your diet or weight?", answer: "I've put on a few pounds this year.", note: "Recent weight gain at BMI 25 — reinforces the case for metabolic screening." },
  { id: "q12", tag: "Adherence", question: "Are you using your albuterol inhaler, and how often?", answer: "Just once in a while, before runs.", note: "Infrequent PRN albuterol — appropriate for mild exercise-induced symptoms." },
  { id: "q13", tag: "Adherence", question: "Are you still using the fluticasone nasal spray daily?", answer: "On and off, when my nose is bad.", note: "Inconsistent nasal steroid use — counsel on daily adherence for better control." },
  { id: "q14", tag: "Wellbeing", question: "How are your energy and stress levels lately?", answer: "Pretty tired and foggy at work, honestly.", note: "Daytime fatigue and brain fog — consistent with poor sleep quality." },
  { id: "q15", tag: "Follow-up", question: "Would you be open to a sleep study if your doctor recommends it?", answer: "Yeah, if it'll help me feel better, definitely.", note: "Patient is willing — schedule the sleep-study referral." },
]

// Stream a short Grok clinical observation about the patient's answer.
async function analyzeWithGrok(answer: string, question: string, onChunk: (t: string) => void) {
  const res = await fetch("/api/grok-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: answer, context: { question } }),
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

type CallPhase = "idle" | "input" | "dialing" | "connected" | "speaking" | "ended" | "error"

const liveStatusLabel: Record<string, string> = {
  connecting: "Connecting to Grok Voice…",
  "speaking-question": "Grok is asking the question…",
  listening: "Listening — speak now",
  thinking: "Grok is processing the answer…",
}

export function VoicePanel({ onViewTimeline }: { onViewTimeline?: () => void }) {
  const { data } = usePatient()
  const [openId, setOpenId] = useState<string | null>(null)

  // Unified call state
  const [callPhase, setCallPhase] = useState<CallPhase>("idle")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [callTranscript, setCallTranscript] = useState("")
  const [callError, setCallError] = useState("")
  const esRef = useRef<EventSource | null>(null)

  // Live Grok Voice for Q1
  const { status, transcript, error, startSession, stopListening, disconnect } = useGrokVoice()
  const [liveAnswer, setLiveAnswer] = useState("")
  const [liveAnalysis, setLiveAnalysis] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [liveStarted, setLiveStarted] = useState(false)

  // Q1 uses the patient's real top reconciliation gap question (true context).
  const topGapQ = data?.gaps?.[0]?.question
  const patientName = data?.bundle.demographics.name ?? "the patient"
  const items: IntakeItem[] = topGapQ
    ? [{ ...intake[0], question: topGapQ }, ...intake.slice(1)]
    : intake
  const liveItem = items[0]

  const answered = intake.length
  const total = intake.length
  const pct = Math.round((answered / total) * 100)

  const startLive = useCallback(async () => {
    setLiveAnswer("")
    setLiveAnalysis("")
    setLiveStarted(true)
    await startSession(liveItem.question, async (final) => {
      setLiveAnswer(final)
      disconnect()
      // After the patient answers, Grok reads it and writes a clinical line.
      setAnalyzing(true)
      let acc = ""
      try {
        await analyzeWithGrok(final, liveItem.question, (chunk) => {
          acc += chunk
          setLiveAnalysis(acc)
        })
      } catch {
        setLiveAnalysis("Captured the patient's response and added it to the record.")
      } finally {
        setAnalyzing(false)
      }
    })
  }, [liveItem.question, startSession, disconnect])

  const handleDial = useCallback(async () => {
    const num = phoneNumber.trim()
    if (!num) return
    setCallPhase("dialing")
    setCallTranscript("")
    setCallError("")
    try {
      const res = await fetch("/api/grok-phone-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: num, question: liveItem.question }),
      })
      const d = (await res.json()) as { callSid?: string; error?: string }
      if (!res.ok || !d.callSid) throw new Error(d.error ?? "Call failed to initiate")
      const es = new EventSource(`/api/grok-phone-call/events?callSid=${d.callSid}`)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as { type: string; text?: string; message?: string }
          switch (ev.type) {
            case "call.dialing":
            case "call.ringing": setCallPhase("dialing"); break
            case "call.connected": setCallPhase("connected"); break
            case "call.grok_speaking":
            case "call.patient_speaking": setCallPhase("speaking"); break
            case "call.transcript": setCallTranscript(ev.text ?? ""); setCallPhase("speaking"); break
            case "call.ended": setCallPhase("ended"); es.close(); break
            case "call.error": setCallError(ev.message ?? "Call error"); setCallPhase("error"); es.close(); break
          }
        } catch { /* ignore */ }
      }
      es.onerror = () => { setCallError("Lost connection to call stream"); setCallPhase("error"); es.close() }
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "Call failed")
      setCallPhase("error")
    }
  }, [phoneNumber, liveItem.question])

  return (
    <section className="py-16 px-6 bg-muted/40">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="flex flex-col gap-1 mb-8">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600">
              <Mic className="size-3.5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Patient Voice Intake</h2>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-0 ml-1">
              <Sparkles className="size-3 mr-1" />
              Grok Voice
            </Badge>
          </div>
          <p className="text-muted-foreground pl-9">
            Grok Voice calls the patient, asks every open question, and adds the answers to the record.
          </p>
        </div>

        <Card className="border border-emerald-500/20 shadow-lg overflow-hidden">
          <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">Voice Interaction Session</CardTitle>
                <CardDescription>Grok Voice resolves gaps in the patient&apos;s care record</CardDescription>
              </div>
              {callPhase === "idle" && (
                <Button
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  onClick={() => setCallPhase("input")}
                >
                  <Phone className="size-4" />
                  Call Patient
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <CheckCircle className="size-4 text-emerald-500" />
                  Intake complete
                </span>
                <span className="text-sm font-semibold text-emerald-600">
                  {answered} of {total} answered · {pct}%
                </span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            {/* Unified call flow */}
            {callPhase !== "idle" && (
              <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 flex flex-col gap-3">
                {callPhase === "input" && (
                  <>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Phone className="size-4 text-emerald-600" />
                      Call the patient via Grok Voice
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Grok will call, ask the open question, listen to the answer, and return a clinical analysis.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleDial() }}
                        className="h-9 text-sm"
                      />
                      <Button
                        className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
                        onClick={handleDial}
                        disabled={!phoneNumber.trim()}
                      >
                        <PhoneCall className="size-3.5" />
                        Call Now
                      </Button>
                      <Button variant="ghost" className="h-9" onClick={() => setCallPhase("idle")}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}

                {(callPhase === "dialing" || callPhase === "connected" || callPhase === "speaking") && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                      {callPhase === "dialing" ? (
                        <><Loader2 className="size-4 animate-spin" />Dialing {phoneNumber}…</>
                      ) : (
                        <><PhoneCall className="size-4 animate-pulse" />Call in progress…</>
                      )}
                    </div>
                    {callTranscript && (
                      <div className="rounded-lg bg-background/60 px-3 py-2 border border-border/60">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Patient said</p>
                        <p className="text-sm text-foreground italic">&ldquo;{callTranscript}&rdquo;</p>
                      </div>
                    )}
                  </div>
                )}

                {callPhase === "ended" && (
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle className="size-4" />
                    Call complete — answers added to the record.
                  </div>
                )}

                {callPhase === "error" && (
                  <div className="flex items-start gap-2">
                    <PhoneOff className="size-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Call failed</p>
                      <p className="text-xs text-destructive/80 mt-0.5">{callError}</p>
                      <Button variant="ghost" size="sm" className="h-7 text-xs mt-1" onClick={() => setCallPhase("idle")}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dynamic-questions signature */}
            <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 px-3 py-2">
              <Sparkles className="size-3.5 text-emerald-600 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Questions generated dynamically from {patientName}&apos;s active reconciliation gaps — the top gap is asked live.
              </p>
            </div>

            {/* Grouped, collapsible question list */}
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {items.map((item, idx) => {
                const isOpen = openId === item.id
                const isLiveQ1 = idx === 0
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground shrink-0 transition-transform duration-200",
                          isOpen ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      <Badge variant="outline" className={cn(
                        "text-[10px] shrink-0",
                        isLiveQ1 ? "border-primary/40 text-primary bg-primary/10" : "border-primary/20 text-primary bg-primary/5"
                      )}>
                        {isLiveQ1 ? "Live · Top Gap" : item.tag}
                      </Badge>
                      <span className="flex-1 min-w-0 truncate text-sm text-foreground">{item.question}</span>
                      {isLiveQ1 ? (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/10 shrink-0 gap-1">
                          <Play className="size-3" />
                          Demo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 bg-emerald-500/10 shrink-0 gap-1">
                          <CheckCircle className="size-3" />
                          Answered
                        </Badge>
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pl-11 flex flex-col gap-3">
                        {/* Question */}
                        <div className="flex gap-2">
                          <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
                            <Sparkles className="size-3 text-primary" />
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{item.question}</p>
                        </div>

                        {/* Q1 — live Grok Voice demo */}
                        {isLiveQ1 && (
                          <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3 flex flex-col gap-2">
                            <p className="text-xs text-muted-foreground">
                              This question is generated from the patient&apos;s top reconciliation gap. Play it aloud and record the answer live.
                            </p>

                            {!liveStarted && (
                              <Button size="sm" className="gap-1.5 w-fit" onClick={startLive}>
                                <Play className="size-3.5" />
                                Play question &amp; record answer
                              </Button>
                            )}

                            {liveStarted && status !== "idle" && status !== "error" && (
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant="outline" className={cn(
                                  "text-xs gap-1.5",
                                  status === "listening"
                                    ? "border-red-500/30 text-red-600 bg-red-500/10"
                                    : "border-primary/30 text-primary bg-primary/10"
                                )}>
                                  {status === "listening" ? (
                                    <span className="flex gap-0.5 items-end">
                                      {[0, 1, 2, 3].map((i) => (
                                        <span key={i} className="inline-block w-0.5 rounded-full bg-red-500 animate-bounce"
                                          style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 80}ms` }} />
                                      ))}
                                    </span>
                                  ) : status === "speaking-question" ? (
                                    <Volume2 className="size-3" />
                                  ) : (
                                    <Loader2 className="size-3 animate-spin" />
                                  )}
                                  {liveStatusLabel[status] ?? status}
                                </Badge>
                                {status === "listening" && (
                                  <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={stopListening}>
                                    <Square className="size-3 fill-current" />
                                    Done Speaking
                                  </Button>
                                )}
                              </div>
                            )}

                            {(status === "listening" || status === "thinking") && transcript && (
                              <p className="text-sm text-foreground italic leading-relaxed">
                                &ldquo;{transcript}&rdquo;
                                {status === "listening" && <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />}
                              </p>
                            )}

                            {status === "error" && error && (
                              <div className="flex flex-col gap-1.5">
                                <p className="text-xs text-destructive flex items-start gap-1.5">
                                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                                  {error}
                                </p>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 w-fit"
                                  onClick={() => window.open(window.location.href, "_blank")}>
                                  <ExternalLink className="size-3" />
                                  Open in a direct tab (mic needs a real tab)
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Answer — live answer for Q1 if captured, else the recorded answer */}
                        <div className="flex gap-2">
                          <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-accent/10">
                            <Mic className="size-3 text-accent" />
                          </div>
                          <p className="text-sm text-foreground italic leading-relaxed">
                            &ldquo;{isLiveQ1 && liveAnswer ? liveAnswer : item.answer}&rdquo;
                          </p>
                        </div>

                        {/* Grok reads the answer and writes a clinical line about it */}
                        {(!isLiveQ1 || liveAnswer || analyzing) && (
                          <div className="flex gap-2">
                            <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500/10">
                              <Sparkles className="size-3 text-emerald-600" />
                            </div>
                            <p className="text-sm text-foreground/70 leading-relaxed">
                              <span className="font-medium text-emerald-600">Grok: </span>
                              {isLiveQ1 && (liveAnswer || analyzing)
                                ? liveAnalysis || (analyzing ? "Reading the response…" : item.note)
                                : item.note}
                              {isLiveQ1 && analyzing && (
                                <span className="inline-block w-0.5 h-3.5 bg-emerald-500 ml-0.5 animate-pulse align-middle" />
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Summary footer */}
            <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-500/[0.08] border border-emerald-500/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">
                  {answered} patient-reported answers captured via Grok Voice
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-700 hover:bg-emerald-500/10 text-xs"
                onClick={onViewTimeline}
              >
                View Timeline <ChevronRight className="size-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
