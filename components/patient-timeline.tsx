"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  FileText,
  FlaskConical,
  Pill,
  Watch,
  Mic,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { usePatient } from "@/lib/patient-context"

type EventSource = "ehr" | "lab" | "medication" | "wearable" | "voice"

interface TimelineEvent {
  id: string
  date: string
  title: string
  detail: string
  source: EventSource
  confidence: number
  needsReview: boolean
  flagReason?: string
}

const events: TimelineEvent[] = [
  {
    id: "e1",
    date: "Jan 12, 2026",
    title: "Primary care visit — elevated blood sugar noted",
    detail: "Fasting glucose 142 mg/dL. HbA1c ordered. Patient reports fatigue and frequent urination.",
    source: "ehr",
    confidence: 97,
    needsReview: false,
  },
  {
    id: "e2",
    date: "Feb 02, 2026",
    title: "Lab result — A1C 8.2%",
    detail: "HbA1c 8.2% — indicative of uncontrolled Type 2 Diabetes. Renal panel within normal limits.",
    source: "lab",
    confidence: 99,
    needsReview: false,
  },
  {
    id: "e3",
    date: "Feb 15, 2026",
    title: "Wearable data — CGM sensor activated",
    detail: "Continuous glucose monitor linked. Average daily glucose: 178 mg/dL. Post-meal spikes observed.",
    source: "wearable",
    confidence: 88,
    needsReview: false,
  },
  {
    id: "e4",
    date: "Mar 10, 2026",
    title: "Medication started — Metformin 500mg BID",
    detail: "Metformin 500mg prescribed twice daily. 30-day supply dispensed by CVS Pharmacy, Fresno.",
    source: "medication",
    confidence: 95,
    needsReview: false,
  },
  {
    id: "e5",
    date: "Apr 18, 2026",
    title: "Pharmacy gap — no refill detected",
    detail: "Expected 30-day refill not recorded. Last fill was March 10. No cancellation or change order found.",
    source: "medication",
    confidence: 62,
    needsReview: true,
    flagReason: "Medication adherence concern: 65 days without refill detected",
  },
  {
    id: "e6",
    date: "May 05, 2026",
    title: "Wearable data — glucose elevation trend",
    detail: "CGM shows 3-week rising trend. Evening glucose consistently above 200 mg/dL. No dietary logs.",
    source: "wearable",
    confidence: 83,
    needsReview: true,
    flagReason: "Elevated glucose pattern without explanation — possible correlation with stopped medication",
  },
  {
    id: "e7",
    date: "Jun 13, 2026",
    title: "Patient voice clarification — stopped Metformin due to nausea",
    detail: "Via Grok Voice session: \"I stopped taking it because it made me nauseous. My stomach hurt every morning.\" Clinician was not informed.",
    source: "voice",
    confidence: 91,
    needsReview: true,
    flagReason: "Clinician not aware of self-discontinuation — care plan may need revision",
  },
]

const sourceConfig: Record<EventSource, { label: string; icon: React.ElementType; dotClass: string; badgeClass: string }> = {
  ehr: { label: "EHR", icon: FileText, dotClass: "bg-primary", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  lab: { label: "Lab", icon: FlaskConical, dotClass: "bg-violet-500", badgeClass: "bg-violet-50 text-violet-700 border-violet-200" },
  medication: { label: "Pharmacy", icon: Pill, dotClass: "bg-amber-500", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  wearable: { label: "Wearable", icon: Watch, dotClass: "bg-accent", badgeClass: "bg-teal-50 text-teal-700 border-teal-200" },
  voice: { label: "Voice", icon: Mic, dotClass: "bg-pink-500", badgeClass: "bg-pink-50 text-pink-700 border-pink-200" },
}

function ConfidenceDot({ value }: { value: number }) {
  const color = value >= 90 ? "bg-emerald-400" : value >= 70 ? "bg-amber-400" : "bg-red-400"
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("size-2 rounded-full", color)} />
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  )
}

export function PatientTimeline() {
  const { data } = usePatient()
  const liveEvents: TimelineEvent[] = data?.timeline ?? events
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const headerLabel = data
    ? `Patient: ${data.bundle.demographics.name} · ${data.bundle.demographics.age ?? "?"}${data.bundle.demographics.gender ? data.bundle.demographics.gender[0].toUpperCase() : ""} · ${liveEvents.length} events reconciled`
    : "Patient: Maria Gonzalez · Concern: Diabetes Follow-up · Jun 13, 2026"

  return (
    <section className="py-16 px-6 bg-background">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-1 mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="size-5 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Unified Patient Timeline</h2>
            </div>
            <p className="text-muted-foreground">
              All medical events normalized across sources &middot; {liveEvents.filter(e => e.needsReview).length} items need review
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {(Object.entries(sourceConfig) as [EventSource, typeof sourceConfig[EventSource]][]).map(([key, cfg]) => {
              const Icon = cfg.icon
              return (
                <Badge key={key} variant="outline" className={cn("text-xs gap-1", cfg.badgeClass)}>
                  <Icon className="size-3" />
                  {cfg.label}
                </Badge>
              )
            })}
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3 bg-muted/20 border-b">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {headerLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-8 top-0 bottom-0 w-px bg-border" />

              {liveEvents.map((event, idx) => {
                const cfg = sourceConfig[event.source]
                const SourceIcon = cfg.icon
                const isExpanded = expandedId === event.id
                const isLast = idx === liveEvents.length - 1

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "relative pl-16 pr-6 py-4 transition-colors duration-150 cursor-pointer",
                      !isLast && "border-b border-border/50",
                      event.needsReview ? "hover:bg-amber-50/50" : "hover:bg-muted/30",
                      isExpanded && (event.needsReview ? "bg-amber-50/40" : "bg-muted/20")
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  >
                    {/* Source dot on timeline */}
                    <div
                      className={cn(
                        "absolute left-5 top-5 size-6 rounded-full border-2 border-background flex items-center justify-center",
                        cfg.dotClass
                      )}
                    >
                      <SourceIcon className="size-3 text-white" />
                    </div>

                    {/* Main row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground shrink-0">{event.date}</span>
                          <Badge variant="outline" className={cn("text-xs", cfg.badgeClass)}>
                            <SourceIcon className="size-3 mr-1" />
                            {cfg.label}
                          </Badge>
                          {event.needsReview && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              <AlertTriangle className="size-3 mr-1" />
                              Needs Review
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug">{event.title}</p>

                        {/* Flag reason */}
                        {event.flagReason && (
                          <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
                            <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                            {event.flagReason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <ConfidenceDot value={event.confidence} />
                        {isExpanded ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/50 pl-0">
                        <p className="text-sm text-muted-foreground leading-relaxed">{event.detail}</p>
                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" size="sm" className="text-xs h-7">
                            Add Note
                          </Button>
                          {event.needsReview && (
                            <Button size="sm" className="text-xs h-7">
                              Mark Reviewed
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
