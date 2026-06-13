"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  TrendingUp,
  Calendar,
  Pill,
  GitMerge,
  ChevronRight,
  CheckCircle,
  Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { usePatient } from "@/lib/patient-context"
import type { InsightDTO } from "@/lib/types"

const iconByKey: Record<InsightDTO["iconKey"], React.ElementType> = {
  med: Pill,
  trend: TrendingUp,
  calendar: Calendar,
  alert: AlertTriangle,
  merge: GitMerge,
}

type Severity = "high" | "medium" | "low"

interface Insight {
  id: string
  icon: React.ElementType
  title: string
  severity: Severity
  explanation: string
  suggestedAction: string
  resolved: boolean
}

const insights: Insight[] = [
  {
    id: "i1",
    icon: Pill,
    title: "Medication Adherence Concern",
    severity: "high",
    explanation:
      "Metformin prescribed March 10 with no pharmacy refill after April 18 — a 65-day gap. Patient confirmed via voice that she self-discontinued due to GI side effects. Clinician was not notified.",
    suggestedAction: "Review medication alternatives (e.g., extended-release Metformin or GLP-1 agonist). Document patient-reported side effect in EHR. Schedule urgent medication reconciliation visit.",
    resolved: false,
  },
  {
    id: "i2",
    icon: TrendingUp,
    title: "Abnormal Lab Trend",
    severity: "high",
    explanation:
      "A1C of 8.2% (Feb 2026) exceeds the ADA target of <7% for most adults. Combined with elevated fasting glucose (142 mg/dL, Jan 2026) and ongoing CGM data showing glucose >200 mg/dL in evenings, this represents an uncontrolled glycemia pattern.",
    suggestedAction: "Order repeat A1C and comprehensive metabolic panel. Consider endocrinology referral. Initiate structured diabetes management plan.",
    resolved: false,
  },
  {
    id: "i3",
    icon: Calendar,
    title: "Missing Follow-Up Appointment",
    severity: "medium",
    explanation:
      "No endocrinology or diabetes follow-up scheduled since the January primary care visit. Standard of care recommends A1C recheck within 3 months after initiating medication. Patient confirmed she was unaware of the referral need.",
    suggestedAction: "Schedule endocrinology consultation within 2 weeks. Set automated reminder for 3-month A1C recheck. Enable patient portal reminder.",
    resolved: false,
  },
  {
    id: "i4",
    icon: AlertTriangle,
    title: "Patient-Reported Side Effect",
    severity: "medium",
    explanation:
      "Patient reported nausea and morning stomach pain as the reason for stopping Metformin. This adverse effect is not documented in the EHR, creating a gap between the clinical record and the patient's actual experience.",
    suggestedAction: "Document GI intolerance in EHR allergy/adverse reaction section. Consider switching to Metformin ER 500mg which has a lower GI side effect profile.",
    resolved: false,
  },
  {
    id: "i5",
    icon: GitMerge,
    title: "Conflicting / Incomplete Data",
    severity: "low",
    explanation:
      "Wearable CGM shows 3-week glucose elevation trend without corresponding dietary or activity logs. Pharmacy records are incomplete — possible mail-order pharmacy or samples not captured. EHR shows medication as 'active' despite patient self-discontinuation.",
    suggestedAction: "Reconcile EHR medication status to reflect patient-reported discontinuation. Request dietary intake logs from patient. Verify if prescription was filled through any secondary pharmacy.",
    resolved: false,
  },
]

const severityConfig: Record<Severity, { label: string; cardClass: string; badgeClass: string; iconClass: string }> = {
  high: {
    label: "High",
    cardClass: "border-red-200/80",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    iconClass: "text-red-500",
  },
  medium: {
    label: "Medium",
    cardClass: "border-amber-200/80",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    iconClass: "text-amber-500",
  },
  low: {
    label: "Low",
    cardClass: "border-blue-200/80",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    iconClass: "text-blue-500",
  },
}

export function ReconciliationInsights() {
  const { data } = usePatient()
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  const liveInsights: Insight[] = data?.insights
    ? data.insights.map((i) => ({
        ...i,
        icon: iconByKey[i.iconKey] ?? AlertTriangle,
        resolved: false,
      }))
    : insights

  const handleResolve = (id: string) => {
    setResolved((prev) => new Set([...prev, id]))
  }

  const unresolvedCount = liveInsights.filter((i) => !resolved.has(i.id)).length

  return (
    <section className="py-16 px-6 bg-muted/40">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-1 mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="size-5 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Reconciliation Insights</h2>
            </div>
            <p className="text-muted-foreground">
              AI-detected care gaps and data conflicts &middot; {unresolvedCount} of {liveInsights.length} unresolved
            </p>
          </div>
          <div className="flex gap-2 mt-2 sm:mt-0">
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              {liveInsights.filter((i) => i.severity === "high" && !resolved.has(i.id)).length} High
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              {liveInsights.filter((i) => i.severity === "medium" && !resolved.has(i.id)).length} Medium
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {liveInsights.filter((i) => i.severity === "low" && !resolved.has(i.id)).length} Low
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {liveInsights.map((insight) => {
            const cfg = severityConfig[insight.severity]
            const InsightIcon = insight.icon
            const isResolved = resolved.has(insight.id)

            return (
              <Card
                key={insight.id}
                className={cn(
                  "border transition-all duration-300",
                  isResolved
                    ? "opacity-60 border-border bg-muted/20"
                    : cfg.cardClass
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl shrink-0 mt-0.5",
                          isResolved ? "bg-muted" : "bg-background border"
                        )}
                      >
                        <InsightIcon className={cn("size-4", isResolved ? "text-muted-foreground" : cfg.iconClass)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-sm font-semibold">{insight.title}</CardTitle>
                          {isResolved ? (
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle className="size-3 mr-1" />
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={cn("text-xs", cfg.badgeClass)}>
                              {cfg.label} Severity
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {!isResolved && (
                  <CardContent className="pt-0">
                    <div className="pl-12">
                      <CardDescription className="text-sm leading-relaxed text-muted-foreground mb-3">
                        {insight.explanation}
                      </CardDescription>

                      <div className="rounded-lg bg-background border border-border/60 p-3 mb-4">
                        <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                          <ChevronRight className="size-3 text-primary" />
                          Suggested Next Action
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{insight.suggestedAction}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-xs h-7">
                          Add to Report
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleResolve(insight.id)}
                        >
                          <CheckCircle className="size-3 mr-1" />
                          Mark Resolved
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
