"use client"

import { useRef } from "react"
import Link from "next/link"
import { DataIntakeDashboard } from "@/components/data-intake-dashboard"
import { VoicePanel } from "@/components/voice-panel"
import { PatientTimeline } from "@/components/patient-timeline"
import { ReconciliationInsights } from "@/components/reconciliation-insights"
import { ReportGenerator } from "@/components/report-generator"
import { CareStory } from "@/components/care-story"
import { DemoSidebar } from "@/components/demo-sidebar"
import { Activity } from "lucide-react"
import { PatientProvider } from "@/lib/patient-context"

export default function DemoPage() {
  const reportRef = useRef<HTMLDivElement>(null)
  const intakeRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const insightsRef = useRef<HTMLDivElement>(null)

  const refMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
    report: reportRef,
    intake: intakeRef,
    voice: voiceRef,
    timeline: timelineRef,
    insights: insightsRef,
  }

  const scrollTo = (id: string) => {
    refMap[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <PatientProvider>
      <main className="min-h-screen bg-background">
        {/* Slim top bar — logo links back to landing */}
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur px-6 py-3">
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
                <Activity className="size-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">ChartBridge AI</span>
            </Link>
            <span className="text-xs text-muted-foreground">Active review session</span>
          </div>
        </header>

        <div className="flex relative">
          {/* Sticky sidebar — desktop only */}
          <aside className="hidden lg:block sticky top-[57px] self-start h-[calc(100vh-57px)] overflow-y-auto pl-6 pt-6 pb-6 shrink-0">
            <DemoSidebar onSectionNav={scrollTo} />
          </aside>

          {/* Main content column — Report first, then Intake, then the rest */}
          <div className="flex-1 min-w-0">
            <div ref={reportRef}>
              <ReportGenerator />
            </div>
            <div ref={intakeRef}>
              <DataIntakeDashboard />
            </div>
            <div ref={voiceRef}>
              <VoicePanel onViewTimeline={() => scrollTo("timeline")} />
            </div>
            <div ref={timelineRef}>
              <PatientTimeline />
            </div>
            <div ref={insightsRef}>
              <ReconciliationInsights />
            </div>
            <CareStory />
          </div>
        </div>
      </main>
    </PatientProvider>
  )
}
