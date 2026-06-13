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
} from "lucide-react"

export function CareStory() {
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
            ChartBridge AI&apos;s unified view of Maria Gonzalez&apos;s fragmented health data — turned into one coherent narrative.
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
                  Maria Gonzalez — Diabetes Follow-up Review
                </CardTitle>
                <p className="text-sm opacity-70 mt-1">Generated June 13, 2026 &middot; 5 sources reconciled</p>
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
                4/5 Sources Connected
              </Badge>
              <Badge className="bg-white/20 text-white border-0">
                <Mic className="size-3 mr-1" />
                2 Voice Gaps Resolved
              </Badge>
              <Badge className="bg-amber-400/30 text-white border-0">
                <AlertTriangle className="size-3 mr-1" />
                3 High-Priority Flags
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
              <p className="text-sm text-muted-foreground leading-relaxed">
                Maria Gonzalez, 52, was diagnosed with Type 2 Diabetes in early 2026 with A1C of 8.2%. Metformin was prescribed but self-discontinued in April due to nausea — a fact the clinical record did not capture. Glucose levels have been elevated without treatment for over 2 months. Grok Voice clarified the medication gap and uncovered two additional care gaps not found in structured data alone.
              </p>
            </div>

            {/* Timeline highlights */}
            <div className="p-6 border-b">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Timeline Highlights
              </h3>
              <div className="flex flex-col gap-0">
                {[
                  { date: "Jan 12", event: "Elevated blood sugar detected at primary care visit", icon: FileText, color: "bg-primary" },
                  { date: "Feb 02", event: "A1C 8.2% confirmed via lab — uncontrolled", icon: FlaskConical, color: "bg-violet-500" },
                  { date: "Mar 10", event: "Metformin 500mg prescribed", icon: Pill, color: "bg-amber-500" },
                  { date: "Apr 18", event: "Pharmacy gap — no refill detected", icon: AlertTriangle, color: "bg-amber-400", flag: true },
                  { date: "Jun 13", event: "Voice clarification — stopped due to GI nausea", icon: Mic, color: "bg-pink-500", flag: true },
                ].map((item, idx, arr) => {
                  const ItemIcon = item.icon
                  return (
                    <div key={item.date} className="flex gap-4 relative">
                      {/* Line */}
                      {idx < arr.length - 1 && (
                        <div className="absolute left-[19px] top-8 bottom-0 w-px bg-border" />
                      )}
                      <div className={`size-10 rounded-full ${item.color} flex items-center justify-center shrink-0 z-10`}>
                        <ItemIcon className="size-4 text-white" />
                      </div>
                      <div className="pb-4 flex-1">
                        <span className="text-xs font-medium text-muted-foreground">{item.date}</span>
                        <p className={`text-sm ${item.flag ? "text-amber-700 font-medium" : "text-foreground"} leading-snug`}>
                          {item.event}
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
                  {[
                    "Metformin self-discontinued — EHR shows as active",
                    "Endocrinology referral not scheduled",
                    "3-month A1C recheck not ordered",
                    "Adverse drug reaction not documented",
                    "No dietary counseling referral",
                  ].map((gap) => (
                    <div key={gap} className="flex items-start gap-2 text-xs">
                      <div className="size-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      <span className="text-muted-foreground leading-relaxed">{gap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voice clarifications */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Mic className="size-4 text-pink-500" />
                  Voice Clarifications
                </h3>
                <div className="flex flex-col gap-3">
                  {[
                    {
                      q: "Why was Metformin stopped?",
                      a: "\"It made me nauseous. My stomach hurt every morning.\"",
                    },
                    {
                      q: "Was a specialist visit scheduled?",
                      a: "\"No, I thought my primary care doctor would handle it.\"",
                    },
                  ].map((item) => (
                    <div key={item.q} className="rounded-lg bg-muted/40 p-3 border border-border/50">
                      <p className="text-xs text-muted-foreground mb-1">{item.q}</p>
                      <p className="text-xs text-foreground italic leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
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
                {[
                  { action: "Update EHR medication status to discontinued", priority: "urgent" },
                  { action: "Schedule endocrinology consultation", priority: "urgent" },
                  { action: "Order repeat A1C and metabolic panel", priority: "high" },
                  { action: "Consider Metformin ER or GLP-1 agonist", priority: "high" },
                  { action: "Document GI adverse reaction in patient record", priority: "medium" },
                  { action: "Refer to diabetes educator and dietitian", priority: "medium" },
                ].map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center gap-2 rounded-lg border border-border p-3 bg-background"
                  >
                    <div
                      className={`size-2 rounded-full shrink-0 ${
                        item.priority === "urgent"
                          ? "bg-red-400"
                          : item.priority === "high"
                          ? "bg-amber-400"
                          : "bg-primary/40"
                      }`}
                    />
                    <span className="text-xs text-foreground leading-snug">{item.action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <div className="rounded-xl bg-muted/40 border border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  This tool supports data organization and care navigation. It does not diagnose, treat, or replace clinical judgment.
                  All data in this demo is synthetic and does not represent real patients.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
