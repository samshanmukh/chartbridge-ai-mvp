"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Activity,
  FileText,
  Mic,
  AlertTriangle,
  CheckCircle,
  Calendar,
  ChevronRight,
  Download,
  Sparkles,
  FlaskConical,
  Pill,
  Watch,
} from "lucide-react"
import { usePatient } from "@/lib/patient-context"
import type { EventSource } from "@/lib/types"

const srcIcon: Record<EventSource, React.ElementType> = {
  ehr: FileText,
  lab: FlaskConical,
  medication: Pill,
  wearable: Watch,
  voice: Mic,
}
const srcColor: Record<EventSource, string> = {
  ehr: "bg-primary",
  lab: "bg-violet-500",
  medication: "bg-amber-500",
  wearable: "bg-teal-500",
  voice: "bg-pink-500",
}
const sevToPriority: Record<string, string> = {
  high: "urgent",
  medium: "high",
  low: "medium",
}

export function CareStory() {
  const { data, voiceFacts } = usePatient()

  if (!data) {
    return (
      <section className="py-16 px-6 bg-primary/5 border-t border-primary/10">
        <div className="mx-auto max-w-6xl text-center text-sm text-muted-foreground">
          Assembling reconciled care story…
        </div>
      </section>
    )
  }

  const d = data.bundle.demographics
  const sex = d.gender ? d.gender[0].toUpperCase() : ""
  const connected = data.sources.filter((s) => s.status === "connected").length
  const highFlags = data.gaps.filter((g) => g.severity === "high").length
  const highlights = data.timeline.slice(0, 5)

  const summary = `${d.name}, ${d.age ?? "?"}${sex}. ChartBridge AI reconciled ${data.bundle.problems.length} conditions, ${data.bundle.medications.length} medications, ${data.bundle.labs.length} lab results, and ${data.bundle.allergies.length} allergies from live FHIR data, then cross-referenced the clinic's unstructured records. The reconciliation surfaced ${data.gaps.length} gap(s) — ${highFlags} high-priority — that are not obvious from any single source on its own.`

  return (
    <section className="py-16 px-6 bg-primary/5 border-t border-primary/10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-10">
          <Badge className="bg-primary/10 text-primary border-0 mb-4">
            <Sparkles className="size-3 mr-1" />
            Final Output
          </Badge>
          <h2 className="text-3xl font-bold text-foreground text-balance">
            Reconciled Care Story
          </h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
            ChartBridge AI&apos;s unified view of {d.name}&apos;s fragmented health data — turned into one coherent narrative.
          </p>
        </div>

        <Card className="overflow-hidden shadow-lg border border-primary/20">
          {/* Card header */}
          <CardHeader className="bg-primary text-primary-foreground pb-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="size-4" />
                  <span className="text-sm font-medium opacity-80">ChartBridge AI Report</span>
                </div>
                <CardTitle className="text-xl text-balance">
                  {d.name} — Reconciled Care Review
                </CardTitle>
                <p className="text-sm opacity-70 mt-1">
                  {data.live ? "Live FHIR" : "Cached"} &middot; {data.sources.length} sources reconciled
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="gap-1.5 text-xs">
                  <Download className="size-3.5" />
                  Export PDF
                </Button>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge className="bg-white/20 text-white border-0">
                <CheckCircle className="size-3 mr-1" />
                {connected}/{data.sources.length} Sources Connected
              </Badge>
              <Badge className="bg-white/20 text-white border-0">
                <Mic className="size-3 mr-1" />
                {voiceFacts.length} Voice Gaps Resolved
              </Badge>
              <Badge className="bg-amber-400/30 text-white border-0">
                <AlertTriangle className="size-3 mr-1" />
                {highFlags} High-Priority Flags
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Summary */}
            <div className="p-6 border-b">
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Summary
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
            </div>

            {/* Timeline highlights */}
            <div className="p-6 border-b">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Timeline Highlights
              </h3>
              <div className="flex flex-col gap-0">
                {highlights.map((item, idx, arr) => {
                  const ItemIcon = srcIcon[item.source] ?? FileText
                  return (
                    <div key={item.id} className="flex gap-4 relative">
                      {idx < arr.length - 1 && (
                        <div className="absolute left-[19px] top-8 bottom-0 w-px bg-border" />
                      )}
                      <div className={`size-10 rounded-full ${srcColor[item.source] ?? "bg-primary"} flex items-center justify-center shrink-0 z-10`}>
                        <ItemIcon className="size-4 text-white" />
                      </div>
                      <div className="pb-4 flex-1">
                        <span className="text-xs font-medium text-muted-foreground">{item.date}</span>
                        <p className={`text-sm ${item.needsReview ? "text-amber-700 font-medium" : "text-foreground"} leading-snug`}>
                          {item.title}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Two-column: care gaps + voice */}
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Care gaps */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Care Gaps Detected
                </h3>
                <div className="flex flex-col gap-2">
                  {data.gaps.map((gap) => (
                    <div key={gap.id} className="flex items-start gap-2 text-xs">
                      <div className="size-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      <span className="text-muted-foreground leading-relaxed">{gap.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voice clarifications (populated by the voice intake panel) */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Mic className="size-4 text-pink-500" />
                  Voice Clarifications
                </h3>
                {voiceFacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No voice intake captured yet. Run the Grok Voice panel to clarify the gaps on the left directly with the patient.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {voiceFacts.map((item, i) => (
                      <div key={i} className="rounded-lg bg-muted/40 p-3 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">{item.question}</p>
                        <p className="text-xs text-foreground italic leading-relaxed">&ldquo;{item.response}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Next actions */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ChevronRight className="size-4 text-primary" />
                Recommended Next Actions
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.insights.map((insight) => {
                  const priority = sevToPriority[insight.severity] ?? "medium"
                  return (
                    <div
                      key={insight.id}
                      className="flex items-center gap-2 rounded-lg border border-border p-3 bg-background"
                    >
                      <div
                        className={`size-2 rounded-full shrink-0 ${
                          priority === "urgent"
                            ? "bg-red-400"
                            : priority === "high"
                            ? "bg-amber-400"
                            : "bg-primary/40"
                        }`}
                      />
                      <span className="text-xs text-foreground leading-snug">{insight.suggestedAction}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <div className="rounded-xl bg-muted/40 border border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  This tool supports data organization and care navigation. It does not diagnose, treat, or replace clinical judgment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
