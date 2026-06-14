"use client"

import { useRouter } from "next/navigation"
import { HeroSection } from "@/components/hero-section"
import { Activity } from "lucide-react"

export default function Page() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-background">
      {/* Landing — the dashboard lives on its own /demo route so it can't be
          scrolled back to once you start a review. */}
      <HeroSection onStart={() => router.push("/demo")} />

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
            One reconciled care story for every provider and every patient.
          </p>
        </div>
      </footer>
    </main>
  )
}
