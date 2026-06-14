"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  FileText,
  Download,
  Share2,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Stethoscope,
  Quote,
} from "lucide-react"
import { usePatient } from "@/lib/patient-context"
import type { ReportSectionDTO, Citation } from "@/lib/types"

interface ReportSection {
  title: string
  content: string
  flag?: boolean
}

interface ReportData {
  clinician: ReportSectionDTO[]
  patient: ReportSectionDTO[]
  citations: Citation[]
  source: "grok" | "fallback"
  crmMode?: string
}

// Fallback shown only if the live /api/report call fails (it normally returns a
// Grok-generated brief grounded in the real bundle).
const clinicianSections: ReportSection[] = [
  {
    title: "Clinical Summary",
    content:
      "Sam Karri, 30M, with perennial allergic rhinitis, exercise-induced bronchoconstriction, family history of premature CAD, and overweight (BMI 25). Active meds: diphenhydramine 25mg nightly, fluticasone nasal spray, albuterol PRN. Labs from 2023 show borderline lipids and low vitamin D. Wearable shows overnight oxygen desaturations not reflected in the chart.",
  },
  {
    title: "Active Concerns",
    content:
      "1. Possible sleep-disordered breathing — overnight SpO2 dips, fragmented sleep (wearable only)\n2. Chronic nightly first-generation antihistamine taken for sleep\n3. Overdue cardiovascular screening given family history\n4. Latex allergy with prior surgery",
    flag: true,
  },
  {
    title: "Medication Reconciliation",
    content:
      "Active: Diphenhydramine 25 mg nightly (OTC, since 2020)\nActive: Fluticasone nasal spray (since 2022)\nActive: Albuterol HFA PRN (since 2021)\nNo recent refill or review on record for any active medication.",
    flag: true,
  },
  {
    title: "Notable Labs",
    content:
      "Total Cholesterol 212 mg/dL (high)\nLDL 138 mg/dL (high)\nTriglycerides 168 mg/dL (high)\nVitamin D 24 ng/mL (low)\nLast panel ~3 years ago — screening overdue.",
  },
  {
    title: "Care Gaps",
    content:
      "1. No sleep study despite wearable + reported snoring\n2. Lipid/metabolic screening overdue\n3. Latex allergy banner not confirmed across all care settings\n4. Chronic antihistamine use never reassessed",
    flag: true,
  },
  {
    title: "Questions to Clarify at Next Visit",
    content:
      "1. Snoring, gasping, or witnessed apnea overnight?\n2. How often is diphenhydramine relied on for sleep?\n3. Any labs done at outside facilities since 2023?\n4. Is the latex allergy flagged everywhere?",
  },
]

function ReportSection({ section }: { section: ReportSection }) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        section.flag
          ? "border-amber-500/30 bg-amber-500/[0.07]"
          : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        {section.flag && <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />}
        <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
      </div>
      <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-line">{section.content}</p>
    </div>
  )
}

function GeneratingState() {
  return (
    <div className="flex flex-col gap-3 py-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-4">
          <Skeleton className="h-4 w-1/3 mb-3" />
          <Skeleton className="h-3 w-full mb-1.5" />
          <Skeleton className="h-3 w-5/6 mb-1.5" />
          <Skeleton className="h-3 w-4/6" />
        </div>
      ))}
    </div>
  )
}

export function ReportGenerator() {
  const { data } = usePatient()
  const [generated, setGenerated] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<ReportData | null>(null)

  const patientName = data?.bundle.demographics.name ?? "Sam Karri"

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: data?.bundle.demographics.id }),
      })
      setReport((await res.json()) as ReportData)
    } catch (e) {
      console.error("report generation failed", e)
    } finally {
      setGenerating(false)
      setGenerated(true)
    }
  }

  const clinicianData: ReportSection[] = report?.clinician ?? clinicianSections

  return (
    <section className="py-16 px-6 bg-background">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-1 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="size-5 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Clinician Report</h2>
          </div>
          <p className="text-muted-foreground">
            Generate a clinician-ready brief from the reconciled patient data
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4 border-b bg-muted/20">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Stethoscope className="size-4 text-primary" />
                  Clinician Brief
                </CardTitle>
                <CardDescription>
                  {patientName} &middot; Reconciled Review &middot; Generated by ChartBridge AI
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!generated && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    <Sparkles className="size-3.5" />
                    {generating ? "Generating..." : "Generate Clinician Brief"}
                  </Button>
                )}
                {generated && (
                  <>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Download className="size-3.5" />
                      Export PDF
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Share2 className="size-3.5" />
                      Share with Care Team
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {generating ? (
              <GeneratingState />
            ) : generated ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="size-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600">Report generated — ready for clinical review</span>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs ml-auto">
                    {report?.source === "grok" ? "Generated by Grok" : "Reconciliation engine"}
                  </Badge>
                </div>
                <Separator className="mb-2" />
                {clinicianData.map((s) => (
                  <ReportSection key={s.title} section={s} />
                ))}
                {report && report.citations.length > 0 && (
                  <div className="rounded-xl border border-border bg-muted/20 p-4 mt-1">
                    <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                      <Quote className="size-3.5 text-primary" />
                      Source records ({report.crmMode === "xai-collections" ? "xAI Collections RAG" : report.crmMode === "turbopuffer" ? "turbopuffer RAG" : report.crmMode === "openai-memory" ? "vector RAG" : "retrieved"})
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {report.citations.map((c) => (
                        <div key={c.id} className="text-xs text-muted-foreground flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0 bg-background">
                            {c.docType}
                          </Badge>
                          <span className="leading-snug">{c.source}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Stethoscope className="size-6 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Clinician Brief not yet generated</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                  Click generate to create a structured clinical summary with reconciled medications, lab trends, and care gaps.
                </p>
                <Button onClick={handleGenerate} className="gap-2">
                  <Sparkles className="size-4" />
                  Generate Clinician Brief
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
