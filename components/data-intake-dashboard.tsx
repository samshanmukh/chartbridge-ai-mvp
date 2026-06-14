"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FileText,
  FlaskConical,
  Pill,
  Watch,
  Mic,
  RefreshCw,
  Upload,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { usePatient } from "@/lib/patient-context"

type SourceStatus = "connected" | "needs-review" | "missing"

// Icons can't cross the JSON boundary, so map them back by source id.
const iconById: Record<string, React.ElementType> = {
  ehr: FileText,
  lab: FlaskConical,
  medications: Pill,
  wearable: Watch,
  voice: Mic,
}

interface DataSource {
  id: string
  icon: React.ElementType
  name: string
  description: string
  status: SourceStatus
  records: number
  lastUpdated: string
  confidence: number
}

const initialSources: DataSource[] = [
  {
    id: "ehr",
    icon: FileText,
    name: "EHR Records",
    description: "Electronic health records from primary care",
    status: "connected",
    records: 24,
    lastUpdated: "Jun 13, 2026",
    confidence: 94,
  },
  {
    id: "lab",
    icon: FlaskConical,
    name: "Lab Results",
    description: "Blood panels, metabolic tests, diagnostics",
    status: "connected",
    records: 11,
    lastUpdated: "Jun 10, 2026",
    confidence: 98,
  },
  {
    id: "medications",
    icon: Pill,
    name: "Medication History",
    description: "Prescription fill history from pharmacy",
    status: "needs-review",
    records: 7,
    lastUpdated: "Apr 18, 2026",
    confidence: 62,
  },
  {
    id: "wearable",
    icon: Watch,
    name: "Wearable Data",
    description: "Apple Health — heart, oxygen, sleep",
    status: "connected",
    records: 89,
    lastUpdated: "Jun 13, 2026",
    confidence: 87,
  },
  {
    id: "voice",
    icon: Mic,
    name: "Patient Voice Intake",
    description: "Grok Voice-collected patient history",
    status: "missing",
    records: 0,
    lastUpdated: "Never",
    confidence: 0,
  },
]

const statusConfig: Record<SourceStatus, { label: string; icon: React.ElementType; badgeClass: string; iconClass: string }> = {
  connected: {
    label: "Connected",
    icon: CheckCircle,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconClass: "text-emerald-500",
  },
  "needs-review": {
    label: "Needs Review",
    icon: AlertTriangle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    iconClass: "text-amber-500",
  },
  missing: {
    label: "Missing",
    icon: XCircle,
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    iconClass: "text-red-400",
  },
}

function ConfidenceBar({ value, status }: { value: number; status: SourceStatus }) {
  const colorClass =
    status === "connected"
      ? "bg-primary"
      : status === "needs-review"
      ? "bg-amber-400"
      : "bg-muted"

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", colorClass)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">
        {value > 0 ? `${value}%` : "—"}
      </span>
    </div>
  )
}

export function DataIntakeDashboard() {
  const { data, voiceFacts } = usePatient()
  const [sources, setSources] = useState<DataSource[]>(initialSources)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleUploadClick = (id: string) => {
    fileInputRefs.current[id]?.click()
  }

  const handleFileChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingId(id)
    setUploadedFiles((prev) => ({ ...prev, [id]: file.name }))

    // Simulate processing the uploaded file
    setTimeout(() => {
      setSources((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          const addedRecords = Math.floor(Math.random() * 8) + 3
          const newConfidence = Math.min(100, s.confidence + Math.floor(Math.random() * 15) + 10)
          return {
            ...s,
            lastUpdated: "Just now",
            status: "connected" as SourceStatus,
            records: s.records + addedRecords,
            confidence: newConfidence,
          }
        })
      )
      setUploadingId(null)
      // Reset input so same file can be re-uploaded
      if (fileInputRefs.current[id]) fileInputRefs.current[id]!.value = ""
    }, 1800)
  }

  // Replace mock cards with live FHIR-derived sources as soon as they load.
  // The voice card lights up once the patient answers intake questions.
  useEffect(() => {
    if (!data?.sources) return
    setSources(
      data.sources.map((s) => {
        const base = { ...s, icon: iconById[s.id] ?? FileText } as DataSource
        if (s.id === "voice" && voiceFacts.length > 0) {
          return {
            ...base,
            status: "connected",
            records: voiceFacts.length,
            lastUpdated: "Just now",
            confidence: 80,
          }
        }
        return base
      })
    )
  }, [data, voiceFacts])

  const patientName = data?.bundle.demographics.name ?? "this patient"

  const handleRefresh = (id: string) => {
    setLoadingId(id)
    setTimeout(() => {
      setSources((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                lastUpdated: "Just now",
                status: s.status === "missing" ? "needs-review" : s.status,
                records: s.records + (s.id === "voice" ? 1 : 0),
                confidence: s.id === "voice" ? 55 : s.confidence,
              }
            : s
        )
      )
      setLoadingId(null)
    }, 1800)
  }

  const connected = sources.filter((s) => s.status === "connected").length
  const totalRecords = sources.reduce((sum, s) => sum + s.records, 0)

  return (
    <section className="py-16 px-6 bg-background">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col gap-1 mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-foreground">Patient Data Intake</h2>
              {data && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    data.live
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  )}
                >
                  {data.live ? "Live FHIR" : "Cached"}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Connected sources for {patientName} &middot; {connected}/5 active &middot; {totalRecords} total records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              Last sync: Just now
            </div>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="size-3.5" />
              Sync All
            </Button>
          </div>
        </div>

        {/* Source cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => {
            const StatusIcon = statusConfig[source.status].icon
            const SourceIcon = source.icon
            const isLoading = loadingId === source.id
            const isUploading = uploadingId === source.id
            const isBusy = isLoading || isUploading

            return (
              <Card
                key={source.id}
                className={cn(
                  "border transition-all duration-200 hover:shadow-md",
                  source.status === "needs-review" && "border-amber-200/80",
                  source.status === "missing" && "border-dashed border-muted-foreground/30"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl",
                          source.status === "connected" && "bg-primary/10",
                          source.status === "needs-review" && "bg-amber-50",
                          source.status === "missing" && "bg-muted"
                        )}
                      >
                        <SourceIcon
                          className={cn(
                            "size-5",
                            source.status === "connected" && "text-primary",
                            source.status === "needs-review" && "text-amber-600",
                            source.status === "missing" && "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{source.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5 leading-snug">
                          {source.description}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-xs flex items-center gap-1 shrink-0", statusConfig[source.status].badgeClass)}
                    >
                      <StatusIcon className="size-3" />
                      {statusConfig[source.status].label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {isBusy ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-1.5 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                      {isUploading && (
                        <p className="text-xs text-muted-foreground animate-pulse mt-1">
                          Processing {uploadedFiles[source.id] ?? "file"}...
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">{source.records}</span> records
                        </span>
                        <span>Updated: {source.lastUpdated}</span>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Confidence</span>
                        </div>
                        <ConfidenceBar value={source.confidence} status={source.status} />
                      </div>

                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Overall confidence */}
        <Card className="mt-6 border-0 bg-primary/5">
          <CardContent className="py-4 px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Overall Data Completeness</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on 4 of 5 sources connected
                </p>
              </div>
              <div className="flex items-center gap-3 sm:w-64">
                <Progress value={76} className="flex-1 h-2" />
                <span className="text-sm font-bold text-primary w-10 text-right">76%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
