"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Mic, MicOff, Sparkles, CheckCircle, ChevronRight, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Prompt {
  id: string
  question: string
  response: string | null
  tag: string
}

const gapPrompts: Prompt[] = [
  {
    id: "metformin",
    question:
      "Your records show Metformin was prescribed in March, but there is no refill after April. Are you still taking it?",
    response: "I stopped taking it because it made me nauseous. My stomach hurt every morning.",
    tag: "Medication Gap",
  },
  {
    id: "followup",
    question:
      "We see your A1C was 8.2% in February. Did you schedule a follow-up appointment with your endocrinologist?",
    response: "No, I thought my primary care doctor would handle that. No one mentioned it.",
    tag: "Care Gap",
  },
  {
    id: "glucose",
    question:
      "Your wearable shows elevated glucose readings in the evenings over the past 3 weeks. Have you made any dietary changes?",
    response: null,
    tag: "Wearable Alert",
  },
]

export function VoicePanel() {
  const [activePromptId, setActivePromptId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [revealedResponses, setRevealedResponses] = useState<Set<string>>(new Set(["metformin"]))
  const [addedFacts, setAddedFacts] = useState<Set<string>>(new Set(["metformin"]))
  const [pulse, setPulse] = useState(false)

  const handleListen = (promptId: string) => {
    setActivePromptId(promptId)
    setIsListening(true)
    setPulse(true)

    setTimeout(() => {
      setRevealedResponses((prev) => new Set([...prev, promptId]))
      setIsListening(false)
      setTimeout(() => {
        setAddedFacts((prev) => new Set([...prev, promptId]))
        setPulse(false)
      }, 600)
    }, 2200)
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
              AI-Powered
            </Badge>
          </div>
          <p className="text-muted-foreground pl-9">
            Ask the patient to clarify missing history using natural conversation
          </p>
        </div>

        {/* Central voice card */}
        <Card className="border border-primary/20 shadow-lg mb-6 overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Voice Interaction Session</CardTitle>
                <CardDescription>
                  Grok Voice is identifying gaps in Maria&apos;s care record
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn("size-2 rounded-full", isListening ? "bg-red-500 animate-pulse" : "bg-emerald-500")} />
                <span className="text-xs text-muted-foreground">{isListening ? "Listening..." : "Ready"}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Big mic button */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-4">
                {isListening && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping scale-125" />
                    <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping scale-150 animation-delay-150" />
                  </>
                )}
                <button
                  onClick={() => {
                    if (!isListening && activePromptId) {
                      handleListen(activePromptId)
                    }
                  }}
                  className={cn(
                    "relative flex size-20 items-center justify-center rounded-full border-4 transition-all duration-300 focus:outline-none",
                    isListening
                      ? "bg-red-500 border-red-400 shadow-lg shadow-red-500/30"
                      : "bg-primary border-primary/30 shadow-lg shadow-primary/20 hover:scale-105"
                  )}
                  aria-label={isListening ? "Stop listening" : "Start voice session"}
                >
                  {isListening ? (
                    <MicOff className="size-8 text-white" />
                  ) : (
                    <Mic className="size-8 text-white" />
                  )}
                </button>
              </div>
              <p className="text-sm font-medium text-foreground">
                {isListening ? "Listening to patient response..." : "Select a gap prompt below, then press to listen"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Grok Voice transcribes and adds facts to the patient timeline automatically
              </p>
            </div>

            <Separator className="mb-6" />

            {/* Gap prompts */}
            <div className="flex flex-col gap-3">
              {gapPrompts.map((prompt) => {
                const isActive = activePromptId === prompt.id
                const hasResponse = revealedResponses.has(prompt.id)
                const isAdded = addedFacts.has(prompt.id)

                return (
                  <div
                    key={prompt.id}
                    className={cn(
                      "rounded-xl border p-4 transition-all duration-300 cursor-pointer",
                      isActive ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/20"
                    )}
                    onClick={() => !isListening && setActivePromptId(prompt.id)}
                  >
                    {/* Prompt header */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5 shrink-0">
                          {prompt.tag}
                        </Badge>
                        {isAdded && (
                          <Badge variant="outline" className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50">
                            <CheckCircle className="size-3 mr-1" />
                            Added to Timeline
                          </Badge>
                        )}
                      </div>
                      {!hasResponse && (
                        <Button
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          className="text-xs h-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleListen(prompt.id)
                          }}
                          disabled={isListening}
                        >
                          <Volume2 className="size-3 mr-1" />
                          Ask Patient
                        </Button>
                      )}
                    </div>

                    {/* AI prompt */}
                    <div className="flex gap-2 mb-3">
                      <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
                        <Sparkles className="size-3 text-primary" />
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{prompt.question}</p>
                    </div>

                    {/* Patient response */}
                    {hasResponse && prompt.response && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                        <div className="shrink-0 mt-0.5 flex size-5 items-center justify-center rounded-full bg-accent/10">
                          <Mic className="size-3 text-accent" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Patient response:</p>
                          <p className="text-sm text-foreground italic leading-relaxed">
                            &ldquo;{prompt.response}&rdquo;
                          </p>
                          {isAdded && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                              <CheckCircle className="size-3" />
                              New patient-reported fact added to timeline
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Listening state */}
                    {isListening && isActive && !hasResponse && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="flex gap-0.5">
                            {[0, 1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className="w-0.5 bg-primary rounded-full animate-bounce"
                                style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 100}ms` }}
                              />
                            ))}
                          </div>
                          Transcribing...
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Session summary */}
            <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">
                  {addedFacts.size} patient-reported facts added to timeline
                </span>
              </div>
              <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-100 text-xs">
                View Timeline <ChevronRight className="size-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
