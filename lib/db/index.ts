import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Neon integration exposes POSTGRES_PRISMA_URL (with SSL params) as the primary connection string.
const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NO_SSL

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

export const db = drizzle(pool, { schema })
