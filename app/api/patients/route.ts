import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { patients } from "@/lib/db/schema"
import { desc } from "drizzle-orm"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await db.select().from(patients).orderBy(desc(patients.createdAt))
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[v0] GET /api/patients error:", error)
    return NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, birthDate, concern } = body

    if (!name || !email || !birthDate || !concern) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    const [newPatient] = await db
      .insert(patients)
      .values({ name, email, birthDate, concern })
      .returning()

    return NextResponse.json(newPatient, { status: 201 })
  } catch (error) {
    console.error("[v0] POST /api/patients error:", error)
    return NextResponse.json({ error: "Failed to create patient" }, { status: 500 })
  }
}
