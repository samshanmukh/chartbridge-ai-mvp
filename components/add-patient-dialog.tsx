"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UserPlus, CheckCircle } from "lucide-react"
import { usePatient } from "@/lib/patient-context"

interface PatientFormData {
  name: string
  email: string
  birthDate: string
  mainConcern: string
}

const emptyForm: PatientFormData = {
  name: "",
  email: "",
  birthDate: "",
  mainConcern: "",
}

interface AddPatientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPatientDialog({ open, onOpenChange }: AddPatientDialogProps) {
  const [form, setForm] = useState<PatientFormData>(emptyForm)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<PatientFormData>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const { refreshPatients, setActivePatient } = usePatient()

  const validate = (): boolean => {
    const next: Partial<PatientFormData> = {}
    if (!form.name.trim()) next.name = "Full name is required."
    if (!form.email.trim()) {
      next.email = "Email is required."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = "Enter a valid email address."
    }
    if (!form.birthDate) next.birthDate = "Date of birth is required."
    if (!form.mainConcern.trim()) next.mainConcern = "Please describe the main concern."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleChange = (field: keyof PatientFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    if (apiError) setApiError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          birthDate: form.birthDate,
          concern: form.mainConcern.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to save patient.")
      }
      const saved = await res.json()
      await refreshPatients()
      setActivePatient(saved.id)
      setSubmitted(true)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Reset state after close animation
      setTimeout(() => {
        setForm(emptyForm)
        setErrors({})
        setSubmitted(false)
        setSubmitting(false)
        setApiError(null)
      }, 200)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle className="size-7 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Patient added
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{form.name}</span>&apos;s record has been
                created and is ready for review.
              </p>
            </div>
            <Button className="mt-2 w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <UserPlus className="size-4 text-primary" />
                </div>
                <DialogTitle className="text-base font-semibold">Add New Patient</DialogTitle>
              </div>
              <DialogDescription className="text-sm text-muted-foreground">
                Enter the patient&apos;s basic information to create a new intake record.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-4 py-2">
                {/* Full Name */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="patient-name" className="text-sm font-medium">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="patient-name"
                    placeholder="e.g. Jane Smith"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    aria-invalid={!!errors.name}
                    className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="patient-email" className="text-sm font-medium">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="patient-email"
                    type="email"
                    placeholder="jane@example.com"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email}</p>
                  )}
                </div>

                {/* Date of Birth */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="patient-dob" className="text-sm font-medium">
                    Date of Birth <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="patient-dob"
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => handleChange("birthDate", e.target.value)}
                    aria-invalid={!!errors.birthDate}
                    className={errors.birthDate ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.birthDate && (
                    <p className="text-xs text-destructive">{errors.birthDate}</p>
                  )}
                </div>

                {/* Main Concern */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="patient-concern" className="text-sm font-medium">
                    Main Concern of the Enquiry <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="patient-concern"
                    placeholder="Briefly describe the patient's primary reason for this visit or enquiry…"
                    rows={3}
                    value={form.mainConcern}
                    onChange={(e) => handleChange("mainConcern", e.target.value)}
                    aria-invalid={!!errors.mainConcern}
                    className={errors.mainConcern ? "border-destructive focus-visible:ring-destructive resize-none" : "resize-none"}
                  />
                  {errors.mainConcern && (
                    <p className="text-xs text-destructive">{errors.mainConcern}</p>
                  )}
                </div>
              </div>

              {apiError && (
                <p className="mt-2 text-xs text-destructive">{apiError}</p>
              )}

              <DialogFooter className="mt-4 flex gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleClose(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? "Adding…" : "Add Patient"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
