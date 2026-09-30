import "server-only"

import pg from "pg"

import { migrate } from "@/lib/server/migrations.mjs"

// PostgreSQL (Neon) connection pool. DATABASE_URL comes from .env.local (or
// the host's environment). The schema is created/updated automatically on the
// first query after the server starts (see lib/server/migrations.mjs).

// Return DATE columns as "YYYY-MM-DD" strings and timestamps as ISO strings,
// matching the app's types, instead of JS Dates shifted by the time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString())

function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is missing in .env.local")
  const pool = new pg.Pool({
    connectionString,
    // Neon requires channel binding on its pooled endpoint.
    enableChannelBinding: connectionString.includes("channel_binding=require"),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  })
  // An idle connection dropped by the network shouldn't crash the server.
  pool.on("error", (err) => console.error("Postgres pool error:", err.message))
  return pool
}

// One pool per server process; kept on globalThis so dev hot reloads reuse it.
const g = globalThis as unknown as { __cwcarPool?: pg.Pool; __cwcarSchema?: Promise<void> }

function pool() {
  return (g.__cwcarPool ??= createPool())
}

function ensureSchema() {
  g.__cwcarSchema ??= (async () => {
    const client = await pool().connect()
    try {
      await migrate(client)
    } finally {
      client.release()
    }
  })().catch((err) => {
    g.__cwcarSchema = undefined // retry on the next request
    throw err
  })
  return g.__cwcarSchema
}

export type Db = Pick<pg.PoolClient, "query">
export type Row = Record<string, unknown>

// Runs one statement on the pool; returns the rows.
export async function q<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema()
  const res = await pool().query(text, params)
  return res.rows as T[]
}

// Runs fn inside a transaction on one connection; rolls back if it throws.
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await pool().connect()
  try {
    await client.query("BEGIN")
    const out = await fn(client)
    await client.query("COMMIT")
    return out
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Postgres error helpers.
export const isUniqueViolation = (err: unknown, constraint?: string) =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: string }).code === "23505" &&
  (!constraint || (err as { constraint?: string }).constraint === constraint)
