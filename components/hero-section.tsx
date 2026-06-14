"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, Mic, ChevronRight } from "lucide-react"

interface HeroSectionProps {
  onStart: () => void
}

export function HeroSection({ onStart }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-20 lg:py-28">
        {/* Nav */}
        <nav className="flex items-center justify-between mb-20">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary">
              <Activity className="size-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              ChartBridge AI
            </span>
          </div>
          <Button size="sm" onClick={onStart}>
            Start Review
          </Button>
        </nav>

        {/* Hero content */}
        <div className="mx-auto max-w-3xl text-center">
          {/* Eyebrow */}
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            <Badge className="bg-primary/10 text-primary border-0 font-medium">
              <Mic className="size-3 mr-1" />
              Grok Voice
            </Badge>
            <Badge className="bg-accent/10 text-accent border-0 font-medium">
              FHIR-ready
            </Badge>
            <Badge variant="secondary" className="font-medium">
              Patient Agency
            </Badge>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-foreground text-balance sm:text-5xl lg:text-6xl leading-[1.1]">
            Turn fragmented patient records into one reconciled{" "}
            <span className="text-primary">care story</span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-balance">
            ChartBridge AI uses Grok Voice to reconcile fragmented patient data into clinician-ready
            and patient-friendly care reports. One source of truth for every provider and every patient.
          </p>

          <div className="mt-10 flex justify-center">
            <Button size="lg" className="gap-2 px-8" onClick={onStart}>
              Start Patient Review
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Pitch line */}
          <p className="mt-10 text-sm text-muted-foreground italic">
            &ldquo;Reconcile EHR, labs, medications, wearables, and patient voice into one unified timeline.&rdquo;
          </p>
        </div>
      </div>
    </section>
  )
}
