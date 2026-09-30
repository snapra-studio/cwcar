// One-off: copy everything from the old SQLite file (data/cwcar.db) into the
// PostgreSQL database in DATABASE_URL, keeping every id, invoice number,
// date, photo and password hash.
//
//   node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs
//
// Refuses to run if Postgres already has bookings, cars or drivers, so it
// can't duplicate or overwrite data. The SQLite file is left untouched.

import { existsSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import pg from "pg"

import { migrate } from "../lib/server/migrations.mjs"

const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "cwcar.db")
if (!existsSync(file)) {
  console.error(`No SQLite file at ${file}; nothing to migrate.`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs")
  process.exit(1)
}

const lite = new DatabaseSync(file, { readOnly: true })
const all = (sql) => lite.prepare(sql).all()

const source = {
  users: all("SELECT * FROM users"),
  cars: all("SELECT * FROM cars"),
  bookings: all("SELECT * FROM bookings"),
  booking_cars: all("SELECT * FROM booking_cars"),
  ledger: all("SELECT * FROM ledger"),
  kv: all("SELECT * FROM kv"),
}
console.log(
  "SQLite:",
  Object.entries(source)
    .map(([t, rows]) => `${t} ${rows.length}`)
    .join(", ")
)

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  enableChannelBinding: process.env.DATABASE_URL.includes("channel_binding=require"),
})
await client.connect()
try {
  await migrate(client)

  const { rows } = await client.query(
    "SELECT (SELECT count(*) FROM bookings)::int + (SELECT count(*) FROM cars)::int + (SELECT count(*) FROM users)::int AS n"
  )
  if (rows[0].n > 0) {
    console.error("Postgres already has data; not copying again. (Nothing was changed.)")
    process.exitCode = 1
  } else {
    await client.query("BEGIN")
    // Bulk insert a table from JSON rows in one statement.
    const copy = async (table, columns, types, list) => {
      if (!list.length) return
      const cols = columns.join(", ")
      const defs = columns.map((c, i) => `${c} ${types[i]}`).join(", ")
      await client.query(
        `INSERT INTO ${table} (${cols}) SELECT ${cols} FROM jsonb_to_recordset($1::jsonb) AS r(${defs})`,
        [JSON.stringify(list)]
      )
    }

    await copy(
      "users",
      ["id", "name", "email", "phone", "role", "status", "password_hash", "created_at"],
      ["text", "text", "text", "text", "text", "text", "text", "timestamptz"],
      source.users
    )
    await copy(
      "cars",
      ["id", "name", "color", "hex", "style", "plate", "rate", "image", "fleet", "owner_name", "owner_phone", "owner_cost"],
      ["text", "text", "text", "text", "text", "text", "int", "text", "text", "text", "text", "int"],
      source.cars
    )
    await copy(
      "bookings",
      ["id", "inv_no", "created_at", "updated_at", "revision", "status", "date", "type", "customer", "phone", "address",
        "deco", "rate", "deco_cost", "total", "advance", "balance"],
      ["text", "text", "timestamptz", "timestamptz", "int", "text", "date", "text", "text", "text", "text", "text", "int",
        "int", "int", "int", "int"],
      source.bookings
    )
    await copy(
      "booking_cars",
      ["booking_id", "position", "car_id", "car_name", "rate", "fleet", "owner_name", "owner_cost", "driver_id",
        "pickup_time", "pickup_loc", "stops", "drop_time", "drop_loc", "hire_date", "active"],
      ["text", "int", "text", "text", "int", "text", "text", "int", "text", "text", "text", "jsonb", "text", "text",
        "date", "boolean"],
      source.booking_cars.map((r) => ({ ...r, stops: JSON.parse(r.stops || "[]"), active: r.active === 1 }))
    )
    await copy(
      "ledger",
      ["id", "booking_id", "kind", "category", "note", "amount", "date", "created_at"],
      ["text", "text", "text", "text", "text", "int", "date", "timestamptz"],
      source.ledger
    )
    await copy("kv", ["key", "value"], ["text", "text"], source.kv)
    await client.query("COMMIT")

    const check = await client.query(`SELECT
      (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM cars)::int AS cars,
      (SELECT count(*) FROM bookings)::int AS bookings, (SELECT count(*) FROM booking_cars)::int AS booking_cars,
      (SELECT count(*) FROM ledger)::int AS ledger, (SELECT count(*) FROM kv)::int AS kv`)
    console.log(
      "Postgres:",
      Object.entries(check.rows[0])
        .map(([t, n]) => `${t} ${n}`)
        .join(", ")
    )
    const mismatch = Object.entries(check.rows[0]).filter(([t, n]) => source[t].length !== n)
    if (mismatch.length) {
      console.error("Row counts differ:", mismatch.map(([t]) => t).join(", "))
      process.exitCode = 1
    } else {
      console.log("Done: every row copied.")
    }
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {})
  console.error("Migration failed, nothing was saved:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
