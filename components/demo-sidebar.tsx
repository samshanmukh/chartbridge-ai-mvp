"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  User,
  FileText,
  FlaskConical,
  Pill,
  Mic,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertTriangle,
  Info,
  Watch,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface DemoSidebarProps {
  onSectionNav: (section: string) => void
}

export function DemoSidebar({ onSectionNav }: DemoSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const sections = [
    { id: "intake", label: "Data Intake", icon: Activity, count: "4/5" },
    { id: "voice", label: "Voice Panel", icon: Mic, count: "3 gaps", highlight: true },
    { id: "timeline", label: "Timeline", icon: FileText, count: "7 events" },
    { id: "insights", label: "Insights", icon: AlertTriangle, count: "5 issues" },
    { id: "report", label: "Reports", icon: FileText, count: "Ready" },
  ]

  const dataSources = [
    { icon: FileText, label: "EHR Records", status: "connected" },
    { icon: FlaskConical, label: "Lab Results", status: "connected" },
    { icon: Pill, label: "Medication CSV", status: "review" },
    { icon: Mic, label: "Voice Intake", status: "connected" },
    { icon: Watch, label: "Wearable", status: "connected" },
  ]

  return (
    <div className={cn("shrink-0 transition-all duration-300", collapsed ? "w-14" : "w-72")}>
      <Card className="sticky top-6 overflow-hidden border shadow-sm">
        {/* Header */}
        <CardHeader className="pb-3 bg-primary/5 border-b">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <div>
                <CardTitle className="text-sm">Demo Patient</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Active review session</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0 shrink-0"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="p-0">
            {/* Patient info */}
            <div className="p-4 border-b">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm shrink-0">
                  MG
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Maria Gonzalez</p>
                  <p className="text-xs text-muted-foreground">Age 52 &middot; Female</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Primary Concern</span>
                  <span className="font-medium text-foreground text-right max-w-[140px] leading-tight">Diabetes Follow-up</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Main Issue</span>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 mt-1">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="size-3 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-snug">
                      Metformin stopped due to side effects — clinician unaware
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Data sources */}
            <div className="p-4 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Data Sources</p>
              <div className="flex flex-col gap-1.5">
                {dataSources.map((src) => {
                  const SrcIcon = src.icon
                  return (
                    <div key={src.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SrcIcon className="size-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground">{src.label}</span>
                      </div>
                      <div
                        className={cn(
                          "size-2 rounded-full",
                          src.status === "connected" && "bg-emerald-500",
                          src.status === "review" && "bg-amber-400",
                          src.status === "missing" && "bg-red-400"
                        )}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Navigation */}
            <div className="p-4 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sections</p>
              <div className="flex flex-col gap-1">
                {sections.map((s) => {
                  const SectionIcon = s.icon
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSectionNav(s.id)}
                      className={cn(
                        "flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted",
                        s.highlight && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <SectionIcon className={cn("size-3.5", s.highlight ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-xs", s.highlight ? "text-primary font-medium" : "text-foreground")}>
                          {s.label}
                        </span>
                        {s.highlight && (
                          <div className="size-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{s.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Info */}
            <div className="p-4">
              <div className="rounded-lg bg-muted/50 p-3 flex items-start gap-2">
                <Info className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-snug">
                  All data is synthetic. No real PHI is used in this demo.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
