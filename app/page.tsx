"use client"

import { useRef, useState } from "react"
import { HeroSection } from "@/components/hero-section"
import { DataIntakeDashboard } from "@/components/data-intake-dashboard"
import { VoicePanel } from "@/components/voice-panel"
import { PatientTimeline } from "@/components/patient-timeline"
import { ReconciliationInsights } from "@/components/reconciliation-insights"
import { ReportGenerator } from "@/components/report-generator"
import { CareStory } from "@/components/care-story"
import { DemoSidebar } from "@/components/demo-sidebar"
import { Button } from "@/components/ui/button"
import { Activity } from "lucide-react"

export default function Page() {
  const [showDashboard, setShowDashboard] = useState(false)

  const intakeRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const insightsRef = useRef<HTMLDivElement>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const refMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
    intake: intakeRef,
    voice: voiceRef,
    timeline: timelineRef,
    insights: insightsRef,
    report: reportRef,
  }

  const scrollTo = (id: string) => {
    refMap[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleStartReview = () => {
    setShowDashboard(true)
    setTimeout(() => {
      intakeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Hero / Landing */}
      <HeroSection onStartReview={handleStartReview} onViewDemo={handleStartReview} />

      {/* Dashboard layout — shown after CTA click */}
      {showDashboard && (
        <div className="flex relative">
          {/* Sticky sidebar — desktop only */}
          <aside className="hidden lg:block sticky top-0 self-start h-screen overflow-y-auto pl-6 pt-6 pb-6 shrink-0">
            <DemoSidebar onSectionNav={scrollTo} />
          </aside>

          {/* Main content column */}
          <div className="flex-1 min-w-0">
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
            <div ref={reportRef}>
              <ReportGenerator />
            </div>
            <CareStory />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t bg-background py-8 px-6">
        <div className="mx-auto max-w-6xl flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
              <Activity className="size-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">ChartBridge AI</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Hackathon MVP &middot; Best Use of Grok Voice &middot; Synthetic data only &middot; Not a medical device
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Back to top
          </Button>
        </div>
      </footer>
    </main>
  )
}
