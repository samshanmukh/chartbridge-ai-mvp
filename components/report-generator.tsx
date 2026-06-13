"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  FileText,
  User,
  Download,
  Share2,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Stethoscope,
  Heart,
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

const clinicianSections: ReportSection[] = [
  {
    title: "Clinical Summary",
    content:
      "Maria Gonzalez, 52F, presents with uncontrolled Type 2 Diabetes (A1C 8.2%, Feb 2026) and a 65-day Metformin adherence gap. Patient-reported self-discontinuation due to GI side effects (nausea, morning stomach pain) was not previously documented in the EHR. CGM data confirms correlating glucose elevation over the past 3 weeks.",
  },
  {
    title: "Active Concerns",
    content: "1. Uncontrolled glycemia — A1C 8.2%, evening glucose >200 mg/dL\n2. Medication self-discontinuation — Metformin 500mg stopped April 2026\n3. Undocumented adverse drug reaction — GI intolerance\n4. No endocrinology follow-up since January 2026",
    flag: true,
  },
  {
    title: "Medication Reconciliation",
    content:
      "Current EHR status: Metformin 500mg BID — Active (INCORRECT)\nActual status per patient voice: DISCONTINUED April 2026\nReason: Nausea and morning stomach pain (patient-reported)\nRecommendation: Update to discontinued. Consider Metformin ER 500mg BID or GLP-1 agonist (Semaglutide/Tirzepatide).",
    flag: true,
  },
  {
    title: "Abnormal Labs",
    content: "A1C: 8.2% (Feb 2026) — Above ADA target of <7%\nFasting Glucose: 142 mg/dL (Jan 2026) — Elevated\nCGM Average: 178 mg/dL (May–Jun 2026) — Elevated\nRenal Panel: Within normal limits (Feb 2026)",
  },
  {
    title: "Care Gaps",
    content: "1. No endocrinology referral completed\n2. No 3-month A1C recheck ordered\n3. Adverse drug reaction not documented\n4. Dietary counseling referral not placed\n5. No patient education on medication adherence documented",
    flag: true,
  },
  {
    title: "Questions to Clarify at Next Visit",
    content: "1. Has patient tried any OTC or alternative remedies?\n2. Is patient monitoring glucose at home beyond CGM?\n3. Any changes to diet, stress level, or physical activity?\n4. Does patient have access to a diabetes educator or dietitian?\n5. Insurance coverage for injectable therapies (GLP-1 agonists)?",
  },
]

const patientSections: ReportSection[] = [
  {
    title: "What We Found",
    content:
      "We reviewed your health records from several sources — your doctor's office, your lab results, your pharmacy, and your glucose monitor. We also listened to what you shared with us. Here's the big picture: your blood sugar has been higher than your doctor's target, and the medicine that was prescribed to help hasn't been getting filled.",
  },
  {
    title: "What Changed",
    content:
      "You told us you stopped taking your Metformin because it was making you nauseous every morning. That's completely understandable, and we're glad you shared that. Your doctor may not know this yet — that's why we're flagging it. There are other medications that may work better for you without the stomach upset.",
    flag: true,
  },
  {
    title: "What to Ask Your Doctor",
    content: "1. \"Can I switch to a different diabetes medicine that won't upset my stomach?\"\n2. \"What should my blood sugar target be, and how am I doing right now?\"\n3. \"Should I see a diabetes specialist?\"\n4. \"Is there someone who can help me with meal planning for diabetes?\"",
  },
  {
    title: "Next Steps",
    content:
      "Your care team will review this report and may reach out to schedule a visit. The most important thing is to not go without treatment while you wait — uncontrolled blood sugar over time can affect your kidneys, eyes, and nerves. Even a short phone call with your doctor can help.",
    flag: true,
  },
  {
    title: "Things Not to Ignore",
    content: "• Your evening glucose readings have been rising for 3 weeks\n• Your A1C was 8.2% — your target is closer to 7%\n• A specialist appointment was never scheduled after your January visit\n• Side effects from medicines should always be reported to your doctor right away",
    flag: true,
  },
]

function ReportSection({ section }: { section: ReportSection }) {
  return (
    <div className={`rounded-xl p-4 border ${section.flag ? "border-amber-200/80 bg-amber-50/50" : "border-border bg-muted/20"}`}>
      <div className="flex items-start gap-2 mb-2">
        {section.flag && <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />}
        <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{section.content}</p>
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
  const [generated, setGenerated] = useState<{ clinician: boolean; patient: boolean }>({
    clinician: false,
    patient: false,
  })
  const [generating, setGenerating] = useState<{ clinician: boolean; patient: boolean }>({
    clinician: false,
    patient: false,
  })
  const [report, setReport] = useState<ReportData | null>(null)

  const patientName = data?.bundle.demographics.name ?? "Maria Gonzalez"

  // One POST /api/report builds both reports (FHIR + gaps + CRM RAG + Grok).
  // The per-type flags just control which tab reveals it.
  const handleGenerate = async (type: "clinician" | "patient") => {
    setGenerating((prev) => ({ ...prev, [type]: true }))
    try {
      let r = report
      if (!r) {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: data?.bundle.demographics.id }),
        })
        r = (await res.json()) as ReportData
        setReport(r)
      }
    } catch (e) {
      console.error("report generation failed", e)
    } finally {
      setGenerating((prev) => ({ ...prev, [type]: false }))
      setGenerated((prev) => ({ ...prev, [type]: true }))
    }
  }

  const clinicianData: ReportSection[] = report?.clinician ?? clinicianSections
  const patientData: ReportSection[] = report?.patient ?? patientSections

  return (
    <section className="py-16 px-6 bg-background">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-1 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="size-5 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Dual Report Generator</h2>
          </div>
          <p className="text-muted-foreground">
            Generate clinician-ready and patient-friendly reports from the reconciled data
          </p>
        </div>

        <Tabs defaultValue="clinician">
          <TabsList className="mb-6 h-10">
            <TabsTrigger value="clinician" className="gap-2">
              <Stethoscope className="size-4" />
              Clinician Report
            </TabsTrigger>
            <TabsTrigger value="patient" className="gap-2">
              <Heart className="size-4" />
              Patient Report
            </TabsTrigger>
          </TabsList>

          {/* Clinician Report */}
          <TabsContent value="clinician">
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
                    {!generated.clinician && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleGenerate("clinician")}
                        disabled={generating.clinician}
                      >
                        <Sparkles className="size-3.5" />
                        {generating.clinician ? "Generating..." : "Generate Clinician Brief"}
                      </Button>
                    )}
                    {generated.clinician && (
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
                {generating.clinician ? (
                  <GeneratingState />
                ) : generated.clinician ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="size-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700">Report generated — ready for clinical review</span>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs ml-auto">
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
                          Source records ({report.crmMode === "turbopuffer" ? "turbopuffer RAG" : report.crmMode === "openai-memory" ? "vector RAG" : "retrieved"})
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
                    <Button onClick={() => handleGenerate("clinician")} className="gap-2">
                      <Sparkles className="size-4" />
                      Generate Clinician Brief
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Patient Report */}
          <TabsContent value="patient">
            <Card>
              <CardHeader className="pb-4 border-b bg-muted/20">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Heart className="size-4 text-accent" />
                      Patient-Friendly Summary
                    </CardTitle>
                    <CardDescription>
                      Written in plain English for {patientName}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!generated.patient && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-accent hover:bg-accent/90"
                        onClick={() => handleGenerate("patient")}
                        disabled={generating.patient}
                      >
                        <Sparkles className="size-3.5" />
                        {generating.patient ? "Generating..." : "Generate Patient Summary"}
                      </Button>
                    )}
                    {generated.patient && (
                      <>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Download className="size-3.5" />
                          Export PDF
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Share2 className="size-3.5" />
                          Send to Patient
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {generating.patient ? (
                  <GeneratingState />
                ) : generated.patient ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="size-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700">Summary generated — ready to share with {patientName.split(" ")[0]}</span>
                      <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 text-xs ml-auto">
                        <User className="size-3 mr-1" />
                        Patient-facing
                      </Badge>
                    </div>
                    <Separator className="mb-2" />
                    {patientData.map((s) => (
                      <ReportSection key={s.title} section={s} />
                    ))}
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 mt-2">
                      <p className="text-xs text-muted-foreground text-center">
                        This tool supports data organization and care navigation. It does not diagnose, treat, or replace clinical judgment.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 mb-4">
                      <Heart className="size-6 text-accent" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">Patient Summary not yet generated</p>
                    <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                      Generate a plain-English summary that empowers {patientName.split(" ")[0]} to understand their health and advocate at their next appointment.
                    </p>
                    <Button onClick={() => handleGenerate("patient")} className="gap-2 bg-accent hover:bg-accent/90">
                      <Sparkles className="size-4" />
                      Generate Patient Summary
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
