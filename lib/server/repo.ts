import "server-only"

import type { z } from "zod"

import { FRESH_FLOWER_COST, pad, uid } from "@/lib/bridal/format"
import {
  bookingMoney,
  DEFAULT_SETTINGS,
  DEMO_CARS,
  fmtBlockRange,
  fmtMinutes,
  toMinutes,
  upgradeBooking,
  upgradeSettings,
  type LegacyBooking,
} from "@/lib/bridal/logic"
import type { BookedCar, Booking, Car, CarBlock, Driver, DriverStatus, IndirectExpense, LedgerEntry, Settings } from "@/lib/bridal/types"
import { isUniqueViolation, q, tx, type Db, type Row } from "@/lib/server/db"
import { UserError } from "@/lib/server/errors"
import { deleteFilesOf, deletePhotoUrl, listAllDocs, resolvePhoto } from "@/lib/server/files"
import { hashPassword } from "@/lib/server/password"
import type {
  bookingInputSchema,
  carSchema,
  driverCreateSchema,
  driverUpdateSchema,
  blockSchema,
  indirectAssignSchema,
  indirectSchema,
  ledgerSchema,
  settingsSchema,
} from "@/lib/server/schemas"

// Data access layer (PostgreSQL). Every read/write of the database goes
// through here, and callers (server actions, route handlers, server pages) do
// the permission check first via lib/server/guard.ts.
//
// The database is far away (~250 ms per round trip), so functions keep the
// number of queries low: bookings load with their cars in one query, checks
// are combined, and inserts are sent in bulk.

export { UserError }

const str = (v: unknown) => (v == null ? undefined : String(v))
const num = (v: unknown) => (v == null ? undefined : Number(v))

// ---- Row mapping ------------------------------------------------------------

function toCar(r: Row): Car {
  return {
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    hex: String(r.hex),
    style: r.style as Car["style"],
    plate: String(r.plate ?? ""),
    rate: Number(r.rate),
    image: str(r.image),
    fleet: (r.fleet as Car["fleet"]) ?? "own",
    ownerName: str(r.owner_name),
    ownerPhone: str(r.owner_phone),
    ownerCost: num(r.owner_cost),
  }
}

function toBookedCar(r: Row): BookedCar {
  return {
    carId: String(r.car_id),
    carName: String(r.car_name),
    rate: Number(r.rate),
    fleet: (str(r.fleet) as BookedCar["fleet"]) ?? undefined,
    ownerName: str(r.owner_name),
    ownerCost: num(r.owner_cost),
    driverId: str(r.driver_id),
    pickupTime: String(r.pickup_time),
    pickupLoc: String(r.pickup_loc),
    stops: (r.stops as BookedCar["stops"]) ?? [],
    dropTime: String(r.drop_time),
    dropLoc: String(r.drop_loc),
  }
}

function toBooking(r: Row): Booking {
  return {
    id: String(r.id),
    invNo: String(r.inv_no),
    createdAt: String(r.created_at),
    updatedAt: str(r.updated_at),
    revision: Number(r.revision ?? 1),
    status: r.status as Booking["status"],
    date: String(r.date),
    cars: ((r.cars as Row[]) ?? []).map(toBookedCar),
    type: r.type as Booking["type"],
    customer: String(r.customer),
    phone: String(r.phone),
    address: String(r.address ?? ""),
    deco: r.deco as Booking["deco"],
    decoNotes: String(r.deco_notes ?? ""),
    rate: Number(r.rate),
    decoCost: Number(r.deco_cost),
    discount: Number(r.discount ?? 0),
    total: Number(r.total),
    advance: Number(r.advance),
    balance: Number(r.balance),
  }
}

function toLedger(r: Row): LedgerEntry {
  return {
    id: String(r.id),
    bookingId: String(r.booking_id),
    kind: r.kind as LedgerEntry["kind"],
    category: String(r.category),
    note: String(r.note ?? ""),
    amount: Number(r.amount),
    date: String(r.date),
    createdAt: String(r.created_at),
  }
}

function toDriver(r: Row): Driver {
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    phone: String(r.phone ?? ""),
    status: r.status as DriverStatus,
    createdAt: String(r.created_at),
  }
}

// Bookings with their cars (in order) in a single query. `where` filters the
// bookings table, aliased b; $n placeholders refer to `params`.
async function loadBookings(where = "", params: unknown[] = [], db?: Db): Promise<Booking[]> {
  const text = `
    SELECT b.*,
      COALESCE(
        (SELECT json_agg(bc ORDER BY bc.position) FROM booking_cars bc WHERE bc.booking_id = b.id),
        '[]'
      ) AS cars
    FROM bookings b
    ${where}
    ORDER BY b.date, b.created_at`
  const rows = db ? (await db.query(text, params)).rows : await q(text, params)
  return rows.map(toBooking)
}

// ---- Settings & flags -------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const [row] = await q("SELECT value FROM kv WHERE key = 'settings'")
  return { ...DEFAULT_SETTINGS, ...(row ? JSON.parse(String(row.value)) : {}) }
}

// Business details for invoices, without the landing-page photo.
export async function getInvoiceSettings(): Promise<Settings> {
  const { coverImage: _cover, ...rest } = await getSettings()
  void _cover
  return rest
}

// Merges into the stored JSON in one statement (the landing photo is kept
// unless a new one is given).
async function mergeSettings(patch: Partial<Settings>, removeCover = false): Promise<Settings> {
  const [row] = await q(
    `INSERT INTO kv (key, value) VALUES ('settings', $1)
     ON CONFLICT (key) DO UPDATE SET value = ((kv.value::jsonb || excluded.value::jsonb) - $2::text[])::text
     RETURNING value`,
    [JSON.stringify(patch), removeCover ? ["coverImage"] : []]
  )
  return { ...DEFAULT_SETTINGS, ...JSON.parse(String(row.value)) }
}

// Business details only; the landing photo is changed with setCoverImage.
export const saveSettings = ({ coverImage: _cover, ...details }: z.infer<typeof settingsSchema>) => {
  void _cover
  return mergeSettings(details)
}

// Stores a new landing photo in file storage and removes the old one.
export async function setCoverImage(image: string | undefined) {
  const old = (await getSettings()).coverImage
  const url = await resolvePhoto(image, "cover", "settings")
  const next = url ? await mergeSettings({ coverImage: url }) : await mergeSettings({}, true)
  if (old && old !== url) await deletePhotoUrl(old)
  return next
}

// ---- Admin snapshot -----------------------------------------------------------

export async function getAdminState() {
  const [cars, bookings, ledger, kv, drivers, files, indirect, blocks] = await Promise.all([
    q("SELECT * FROM cars ORDER BY name"),
    loadBookings(),
    q("SELECT * FROM ledger ORDER BY date, created_at"),
    q("SELECT key, value FROM kv WHERE key IN ('settings', 'initialized')"),
    listDrivers(),
    listAllDocs(),
    listIndirect(),
    listBlocks(),
  ])
  const settings = kv.find((r) => r.key === "settings")
  return {
    initialized: kv.some((r) => r.key === "initialized" && r.value === "1"),
    cars: cars.map(toCar),
    bookings,
    ledger: ledger.map(toLedger),
    settings: { ...DEFAULT_SETTINGS, ...(settings ? JSON.parse(String(settings.value)) : {}) } as Settings,
    drivers,
    files,
    indirect,
    blocks,
  }
}

// ---- Cars ---------------------------------------------------------------------

const CAR_COLUMNS = "id, name, color, hex, style, plate, rate, image, fleet, owner_name, owner_phone, owner_cost"

function carValues(id: string, c: Omit<Car, "id">) {
  const partner = c.fleet === "partner"
  return [
    id,
    c.name,
    c.color,
    c.hex,
    c.style,
    c.plate ?? "",
    c.rate,
    c.image ?? null,
    partner ? "partner" : "own",
    partner ? (c.ownerName ?? "") : null,
    partner ? (c.ownerPhone ?? "") : null,
    partner ? (c.ownerCost ?? 0) : null,
  ]
}

export async function addCar(input: z.infer<typeof carSchema>): Promise<Car> {
  const slug = `${input.name}-${input.color}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  const id = `${slug || "car"}-${uid().slice(-4)}`
  const image = await resolvePhoto(input.image, "car_image", id)
  const [row] = await q(
    `INSERT INTO cars (${CAR_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    carValues(id, { ...input, image })
  )
  return toCar(row)
}

// Existing bookings keep the car name/rate they were made with, so past
// invoices don't change when the catalogue is edited.
export async function updateCar(id: string, input: z.infer<typeof carSchema>): Promise<Car> {
  const old = await carImage(id)
  if (old === null) throw new UserError("That car no longer exists.")
  const image = await resolvePhoto(input.image, "car_image", id)
  const [row] = await q(
    `UPDATE cars SET name = $2, color = $3, hex = $4, style = $5, plate = $6, rate = $7, image = $8, fleet = $9,
       owner_name = $10, owner_phone = $11, owner_cost = $12
     WHERE id = $1 RETURNING *`,
    carValues(id, { ...input, image })
  )
  if (!row) throw new UserError("That car no longer exists.")
  if (old && old !== image) await deletePhotoUrl(old)
  return toCar(row)
}

// The car's current photo URL ("" if none); null if the car doesn't exist.
async function carImage(id: string) {
  const [r] = await q("SELECT image FROM cars WHERE id = $1", [id])
  return r ? (str(r.image) ?? "") : null
}

export async function setCarImage(id: string, image: string | undefined): Promise<Car> {
  const old = await carImage(id)
  if (old === null) throw new UserError("That car no longer exists.")
  const url = await resolvePhoto(image, "car_image", id)
  const [row] = await q("UPDATE cars SET image = $2 WHERE id = $1 RETURNING *", [id, url ?? null])
  if (!row) throw new UserError("That car no longer exists.")
  if (old && old !== url) await deletePhotoUrl(old)
  return toCar(row)
}

// Removes the car with its photo and papers (old hires keep the car name).
export async function removeCar(id: string) {
  const [row] = await q("DELETE FROM cars WHERE id = $1 RETURNING image", [id])
  if (row?.image) await deletePhotoUrl(String(row.image))
  await deleteFilesOf("car_doc", [id])
  await q("DELETE FROM car_blocks WHERE car_id = $1", [id])
}

// ---- Bookings -----------------------------------------------------------------

type BookingInput = z.infer<typeof bookingInputSchema>

// Everything a save needs to validate, fetched in one round trip.
async function bookingChecks(db: Db, input: BookingInput, excludeId: string) {
  const carIds = input.cars.map((c) => c.carId)
  const driverIds = input.cars.flatMap((c) => (c.driverId ? [c.driverId] : []))
  // Waits for any unavailable period being saved for these cars (see addBlock).
  await lockCars(db, carIds)
  const { rows } = await db.query(
    `SELECT
       (SELECT COALESCE(json_agg(id), '[]') FROM cars WHERE id = ANY($1::text[])) AS cars,
       (SELECT COALESCE(json_agg(json_build_object('id', id, 'status', status)), '[]')
          FROM users WHERE role = 'driver' AND id = ANY($2::text[])) AS drivers,
       -- Active slots of these cars that overlap the new slots (same rule as ex_car_slot).
       (SELECT COALESCE(json_agg(json_build_object('car', bc.car_name, 'from', lower(bc.slot), 'to', upper(bc.slot))), '[]')
          FROM booking_cars bc
          JOIN jsonb_to_recordset($5::jsonb) AS r(car_id text, pickup_time text, drop_time text) ON r.car_id = bc.car_id
          WHERE bc.active AND bc.booking_id <> $4
            AND bc.slot && booking_slot($3::date, r.pickup_time, r.drop_time)) AS clash,
       -- Periods these cars are marked unavailable (repair, service…).
       (SELECT COALESCE(json_agg(json_build_object('car', cb.car_name, 'reason', cb.reason,
                 'start', to_char(cb.start_at, 'YYYY-MM-DD"T"HH24:MI'), 'end', to_char(cb.end_at, 'YYYY-MM-DD"T"HH24:MI'))), '[]')
          FROM car_blocks cb
          JOIN jsonb_to_recordset($5::jsonb) AS r(car_id text, pickup_time text, drop_time text) ON r.car_id = cb.car_id
          WHERE tsrange(cb.start_at, cb.end_at) && booking_slot($3::date, r.pickup_time, r.drop_time)) AS blocked,
       (SELECT count(*)::int FROM bookings WHERE date_part('year', date) = date_part('year', $3::date)) AS year_count`,
    [
      carIds,
      driverIds,
      input.date,
      excludeId,
      JSON.stringify(input.cars.map((c) => ({ car_id: c.carId, pickup_time: c.pickupTime, drop_time: c.dropTime }))),
    ]
  )
  const r = rows[0]
  return {
    existingCars: new Set(r.cars as string[]),
    drivers: new Map((r.drivers as { id: string; status: string }[]).map((d) => [d.id, d.status])),
    clash: r.clash as { car: string; from: string; to: string }[],
    blocked: r.blocked as { car: string; reason: string; start: string; end: string }[],
    yearCount: Number(r.year_count),
  }
}

// Recalculates money from the cars (never trusts totals from the browser) and
// checks every car and driver. The clash check gives a friendly message; the
// ex_car_slot constraint is the hard guarantee.
function validate(input: BookingInput, checks: Awaited<ReturnType<typeof bookingChecks>>, existing?: Booking) {
  const seen = new Set<string>()
  for (const c of input.cars) {
    if (seen.has(c.carId)) throw new UserError("The same car is on this hire twice.")
    seen.add(c.carId)
    // A car removed from the catalogue may stay on a hire it was already on.
    const onExisting = existing?.cars.some((x) => x.carId === c.carId)
    if (!checks.existingCars.has(c.carId) && !onExisting) throw new UserError(`${c.carName} is no longer in the fleet.`)
    if (c.driverId) {
      const status = checks.drivers.get(c.driverId)
      const keptSame = existing?.cars.some((x) => x.carId === c.carId && x.driverId === c.driverId)
      if (!status || (status !== "active" && !keptSame)) throw new UserError("Pick an active driver.")
    }
  }
  if (checks.clash.length) {
    const at = (ts: string) => fmtMinutes(toMinutes(ts.slice(11, 16)))
    const list = checks.clash.map((c) => `${c.car} (${at(c.from)} – ${at(c.to)})`).join(", ")
    throw new UserError(`Already booked at that time: ${list}. Pick another time or car.`)
  }
  if (checks.blocked.length) {
    const list = checks.blocked.map((b) => `${b.car} (${b.reason}, ${fmtBlockRange(b)})`).join("; ")
    throw new UserError(`Marked unavailable at that time: ${list}. Pick another time or car.`)
  }
  const rate = input.cars.reduce((n, c) => n + c.rate, 0)
  const decoCost = input.deco === "fresh" ? FRESH_FLOWER_COST * input.cars.length : 0
  if (input.discount > rate + decoCost) throw new UserError("The discount can't be more than the hire amount.")
  const m = bookingMoney({ rate, decoCost, discount: input.discount, advance: input.advance })
  return { rate, decoCost, discount: m.discount, total: m.total, balance: m.balance }
}

// Inserts all cars of a hire in one statement.
async function insertBookingCars(db: Db, bookingId: string, date: string, active: boolean, cars: BookingInput["cars"]) {
  const rows = cars.map((c, i) => {
    const partner = c.fleet === "partner"
    return {
      position: i,
      car_id: c.carId,
      car_name: c.carName,
      rate: c.rate,
      fleet: partner ? "partner" : null,
      owner_name: partner ? (c.ownerName ?? "") : null,
      owner_cost: partner ? (c.ownerCost ?? 0) : null,
      driver_id: c.driverId ?? null,
      pickup_time: c.pickupTime,
      pickup_loc: c.pickupLoc,
      stops: c.stops,
      drop_time: c.dropTime,
      drop_loc: c.dropLoc,
    }
  })
  await db.query(
    `INSERT INTO booking_cars (booking_id, position, car_id, car_name, rate, fleet, owner_name, owner_cost, driver_id,
       pickup_time, pickup_loc, stops, drop_time, drop_loc, hire_date, active)
     SELECT $1, r.position, r.car_id, r.car_name, r.rate, r.fleet, r.owner_name, r.owner_cost, r.driver_id,
       r.pickup_time, r.pickup_loc, r.stops, r.drop_time, r.drop_loc, $2::date, $3
     FROM jsonb_to_recordset($4::jsonb) AS r(position int, car_id text, car_name text, rate int, fleet text,
       owner_name text, owner_cost int, driver_id text, pickup_time text, pickup_loc text, stops jsonb,
       drop_time text, drop_loc text)`,
    [bookingId, date, active, JSON.stringify(rows)]
  )
}

// Turns the double-booking index into the same message as the friendly check.
async function guardDoubleBooking<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    // ex_car_slot: another save took an overlapping slot first.
    if (typeof err === "object" && err && (err as { code?: string }).code === "23P01") {
      throw new UserError("One of these cars was just booked for an overlapping time. Pick another time or car.")
    }
    throw err
  }
}

const invNoFor = (date: string, n: number, id: string) =>
  `WC-${date.replace(/-/g, "").slice(2)}-${pad(n)}${id.slice(-2).toUpperCase()}`

export async function getBooking(id: string) {
  return (await loadBookings("WHERE b.id = $1", [id]))[0]
}

export async function createBooking(input: BookingInput): Promise<Booking> {
  // Retries only if two saves pick the same invoice number at once.
  for (let attempt = 0; ; attempt++) {
    try {
      return await guardDoubleBooking(() =>
        tx(async (db) => {
          const checks = await bookingChecks(db, input, "")
          const money = validate(input, checks)
          const id = uid()
          const createdAt = new Date().toISOString()
          const invNo = invNoFor(input.date, checks.yearCount + 1 + attempt, id)
          await db.query(
            `INSERT INTO bookings (id, inv_no, created_at, revision, status, date, type, customer, phone, address, deco,
               rate, deco_cost, total, advance, balance, discount, deco_notes)
             VALUES ($1, $2, $3, 1, 'confirmed', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              id,
              invNo,
              createdAt,
              input.date,
              input.type,
              input.customer,
              input.phone,
              input.address,
              input.deco,
              money.rate,
              money.decoCost,
              money.total,
              input.advance,
              money.balance,
              money.discount,
              input.decoNotes,
            ]
          )
          await insertBookingCars(db, id, input.date, true, input.cars)
          return {
            id,
            invNo,
            createdAt,
            revision: 1,
            status: "confirmed",
            date: input.date,
            cars: input.cars,
            type: input.type,
            customer: input.customer,
            phone: input.phone,
            address: input.address,
            deco: input.deco,
            decoNotes: input.decoNotes,
            ...money,
            advance: input.advance,
          } satisfies Booking
        })
      )
    } catch (err) {
      if (attempt < 5 && isUniqueViolation(err, "bookings_inv_no_key")) continue
      throw err
    }
  }
}

// Keeps the invoice number and creation date; bumps the revision so the
// re-issued invoice is marked as revised.
export async function updateBooking(id: string, input: BookingInput): Promise<Booking> {
  return guardDoubleBooking(() =>
    tx(async (db) => {
      // Lock the booking so two edits can't interleave.
      const locked = await db.query("SELECT id FROM bookings WHERE id = $1 FOR UPDATE", [id])
      if (!locked.rowCount) throw new UserError("That booking no longer exists.")
      const [existing] = await loadBookings("WHERE b.id = $1", [id], db)
      if (existing.status === "cancelled") throw new UserError("A cancelled booking can't be edited.")
      const money = validate(input, await bookingChecks(db, input, id), existing)
      const updatedAt = new Date().toISOString()
      await db.query(
        `WITH u AS (
           UPDATE bookings SET updated_at = $2, revision = revision + 1, date = $3, type = $4, customer = $5, phone = $6,
             address = $7, deco = $8, rate = $9, deco_cost = $10, total = $11, advance = $12, balance = $13,
             discount = $14, deco_notes = $15
           WHERE id = $1
         )
         DELETE FROM booking_cars WHERE booking_id = $1`,
        [
          id,
          updatedAt,
          input.date,
          input.type,
          input.customer,
          input.phone,
          input.address,
          input.deco,
          money.rate,
          money.decoCost,
          money.total,
          input.advance,
          money.balance,
          money.discount,
          input.decoNotes,
        ]
      )
      await insertBookingCars(db, id, input.date, true, input.cars)
      return {
        ...existing,
        updatedAt,
        revision: (existing.revision ?? 1) + 1,
        date: input.date,
        cars: input.cars,
        type: input.type,
        customer: input.customer,
        phone: input.phone,
        address: input.address,
        deco: input.deco,
        decoNotes: input.decoNotes,
        ...money,
        advance: input.advance,
      }
    })
  )
}

// Cancelled hires stay on record but free their cars.
export async function cancelBooking(id: string): Promise<Booking> {
  await q(
    `WITH b AS (UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING id)
     UPDATE booking_cars SET active = false WHERE booking_id IN (SELECT id FROM b)
     RETURNING booking_id`,
    [id]
  )
  const booking = await getBooking(id)
  if (!booking) throw new UserError("That booking no longer exists.")
  return booking
}

// ---- Ledger -------------------------------------------------------------------

export async function addLedgerEntry(input: z.infer<typeof ledgerSchema>): Promise<LedgerEntry> {
  const [row] = await q(
    `INSERT INTO ledger (id, booking_id, kind, category, note, amount, date, created_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, now() WHERE EXISTS (SELECT 1 FROM bookings WHERE id = $2)
     RETURNING *`,
    [uid(), input.bookingId, input.kind, input.category, input.note, input.amount, input.date]
  )
  if (!row) throw new UserError("That hire no longer exists.")
  return toLedger(row)
}

// Removes the entry and any receipt attached to it.
export async function removeLedgerEntry(id: string) {
  await q("DELETE FROM ledger WHERE id = $1", [id])
  await deleteFilesOf("ledger", [id])
}

// ---- Drivers ------------------------------------------------------------------

export async function listDrivers() {
  return (await q("SELECT * FROM users WHERE role = 'driver' ORDER BY name")).map(toDriver)
}

export async function getDriver(id: string) {
  const [r] = await q("SELECT * FROM users WHERE id = $1 AND role = 'driver'", [id])
  return r ? toDriver(r) : undefined
}

// For login only: includes the hash.
export async function findDriverForLogin(email: string) {
  const [r] = await q("SELECT * FROM users WHERE lower(email) = lower($1) AND role = 'driver'", [email])
  return r ? { ...toDriver(r), passwordHash: String(r.password_hash) } : undefined
}

function assertNotAdminEmail(email: string) {
  if (process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) {
    throw new UserError("That email is the admin login. Use a different one.")
  }
}

// The lower(email) unique index reports a duplicate; say it plainly.
async function uniqueEmail<T>(fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err) {
    if (isUniqueViolation(err, "ux_users_email")) throw new UserError("Another driver already uses that email.")
    throw err
  }
}

export async function createDriver(input: z.infer<typeof driverCreateSchema>): Promise<Driver> {
  assertNotAdminEmail(input.email)
  const hash = await hashPassword(input.password)
  return uniqueEmail(async () => {
    const [row] = await q(
      `INSERT INTO users (id, name, email, phone, role, status, password_hash)
       VALUES ($1, $2, $3, $4, 'driver', 'active', $5) RETURNING *`,
      [`drv-${uid()}`, input.name, input.email, input.phone, hash]
    )
    return toDriver(row)
  })
}

export async function updateDriver(id: string, input: z.infer<typeof driverUpdateSchema>): Promise<Driver> {
  assertNotAdminEmail(input.email)
  return uniqueEmail(async () => {
    const [row] = await q(
      "UPDATE users SET name = $2, email = $3, phone = $4, status = $5 WHERE id = $1 AND role = 'driver' RETURNING *",
      [id, input.name, input.email, input.phone, input.status]
    )
    if (!row) throw new UserError("That driver no longer exists.")
    return toDriver(row)
  })
}

export async function setDriverPassword(id: string, password: string) {
  const [row] = await q("UPDATE users SET password_hash = $2 WHERE id = $1 AND role = 'driver' RETURNING id", [
    id,
    await hashPassword(password),
  ])
  if (!row) throw new UserError("That driver no longer exists.")
}

// ---- Driver views (always scoped to one driver) ---------------------------------

// A hire as a driver sees it: only the cars they drive on it.
export type DriverHire = Booking & { myCars: BookedCar[] }

const scopeToDriver = (b: Booking, driverId: string): DriverHire => ({
  ...b,
  myCars: b.cars.filter((c) => c.driverId === driverId),
})

// Hires from `fromDate` on where this driver drives at least one car.
export async function getDriverHires(driverId: string, fromDate: string): Promise<DriverHire[]> {
  const hires = await loadBookings(
    "WHERE b.date >= $1 AND EXISTS (SELECT 1 FROM booking_cars x WHERE x.booking_id = b.id AND x.driver_id = $2)",
    [fromDate, driverId]
  )
  return hires.map((b) => scopeToDriver(b, driverId))
}

// One hire, only if this driver is on it; otherwise undefined (callers 404).
export async function getDriverHire(driverId: string, bookingId: string): Promise<DriverHire | undefined> {
  const [b] = await loadBookings(
    "WHERE b.id = $1 AND EXISTS (SELECT 1 FROM booking_cars x WHERE x.booking_id = b.id AND x.driver_id = $2)",
    [bookingId, driverId]
  )
  return b ? scopeToDriver(b, driverId) : undefined
}

// Photo, plate and look of the given cars, for the driver's hire cards.
export async function getCarInfo(ids: string[]) {
  if (!ids.length) return {}
  const rows = await q("SELECT id, name, hex, style, image, plate FROM cars WHERE id = ANY($1::text[])", [ids])
  return Object.fromEntries(
    rows.map((r) => [
      String(r.id),
      { name: String(r.name), hex: String(r.hex), style: r.style as Car["style"], image: str(r.image), plate: String(r.plate ?? "") },
    ])
  )
}

// ---- Public availability (no customer, price, route or driver data) -----------------

export type PublicCar = Pick<Car, "id" | "name" | "color" | "hex" | "style" | "image">

export async function getPublicCars(): Promise<PublicCar[]> {
  return (await q("SELECT id, name, color, hex, style, image FROM cars ORDER BY name")).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    hex: String(r.hex),
    style: r.style as Car["style"],
    image: str(r.image),
  }))
}

// Booked time slots (car + start/end only) overlapping the days from..to
// inclusive, for the public availability page. Nothing else about the hire.
// `blocked` marks a period the car is unavailable (repair…); the reason stays private.
export type PublicSlot = { carId: string; start: string; end: string; blocked?: true }

export async function getBookedSlots(from: string, to: string): Promise<PublicSlot[]> {
  const rows = await q(
    `SELECT car_id, to_char(lower(slot), 'YYYY-MM-DD"T"HH24:MI') AS start, to_char(upper(slot), 'YYYY-MM-DD"T"HH24:MI') AS "end"
, false AS blocked
     FROM booking_cars
     WHERE active AND slot && tsrange($1::date, $2::date + 1)
     UNION ALL
     SELECT car_id, to_char(start_at, 'YYYY-MM-DD"T"HH24:MI'), to_char(end_at, 'YYYY-MM-DD"T"HH24:MI'), true
     FROM car_blocks
     WHERE tsrange(start_at, end_at) && tsrange($1::date, $2::date + 1)
     ORDER BY start`,
    [from, to]
  )
  return rows.map((r) => ({
    carId: String(r.car_id),
    start: String(r.start),
    end: String(r.end),
    ...(r.blocked ? { blocked: true as const } : {}),
  }))
}

// ---- First run ----------------------------------------------------------------

type ImportPayload = {
  cars?: Car[]
  bookings?: LegacyBooking[]
  ledger?: LedgerEntry[]
  settings?: Partial<Settings>
}

// Moves data an older version saved in the admin's browser into the database,
// once. With nothing to import, starts with the demo fleet.
export async function initializeFrom(payload: ImportPayload | null) {
  // Photos saved in the browser were data URLs; put them in file storage first.
  if (payload?.cars) {
    payload = {
      ...payload,
      cars: await Promise.all(payload.cars.map(async (c) => ({ ...c, image: await resolvePhoto(c.image, "car_image", c.id) }))),
    }
  }
  if (payload?.settings?.coverImage) {
    payload = { ...payload, settings: { ...payload.settings, coverImage: await resolvePhoto(payload.settings.coverImage, "cover", "settings") } }
  }
  return tx(async (db) => {
    // Lock the flag row so two first-runs can't both import.
    await db.query("INSERT INTO kv (key, value) VALUES ('initializing', '1') ON CONFLICT (key) DO NOTHING")
    await db.query("SELECT value FROM kv WHERE key = 'initializing' FOR UPDATE")
    const done = await db.query("SELECT 1 FROM kv WHERE key = 'initialized' AND value = '1'")
    if (done.rowCount) return { imported: false }

    const cars = payload?.cars ?? (payload ? [] : DEMO_CARS)
    if (cars.length) {
      await db.query(
        `INSERT INTO cars (${CAR_COLUMNS})
         SELECT r.id, r.name, r.color, r.hex, r.style, r.plate, r.rate, r.image, r.fleet, r.owner_name, r.owner_phone, r.owner_cost
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, name text, color text, hex text, style text, plate text,
           rate int, image text, fleet text, owner_name text, owner_phone text, owner_cost int)
         ON CONFLICT (id) DO NOTHING`,
        [
          JSON.stringify(
            cars.map((c) => {
              const [id, name, color, hex, style, plate, rate, image, fleet, owner_name, owner_phone, owner_cost] =
                carValues(c.id, c)
              return { id, name, color, hex, style, plate, rate, image, fleet, owner_name, owner_phone, owner_cost }
            })
          ),
        ]
      )
    }

    const bookings = (payload?.bookings ?? []).map(upgradeBooking)
    if (bookings.length) {
      await db.query(
        `INSERT INTO bookings (id, inv_no, created_at, updated_at, revision, status, date, type, customer, phone, address,
           deco, rate, deco_cost, total, advance, balance)
         SELECT r.id, r.inv_no, r.created_at, r.updated_at, r.revision, r.status, r.date, r.type, r.customer, r.phone,
           r.address, r.deco, r.rate, r.deco_cost, r.total, r.advance, r.balance
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, inv_no text, created_at timestamptz, updated_at timestamptz,
           revision int, status text, date date, type text, customer text, phone text, address text, deco text,
           rate int, deco_cost int, total int, advance int, balance int)
         ON CONFLICT DO NOTHING`,
        [
          JSON.stringify(
            bookings.map((b) => ({
              id: b.id,
              inv_no: b.invNo,
              created_at: b.createdAt,
              updated_at: b.updatedAt ?? null,
              revision: b.revision ?? 1,
              status: b.status,
              date: b.date,
              type: b.type,
              customer: b.customer,
              phone: b.phone,
              address: b.address ?? "",
              deco: b.deco,
              rate: b.rate,
              deco_cost: b.decoCost,
              total: b.total,
              advance: b.advance,
              balance: b.balance,
            }))
          ),
        ]
      )
      // Old data could hold a double-booking; import clashing cars as inactive
      // rather than failing the whole import.
      const taken = new Set<string>()
      const carRows = bookings.flatMap((b) =>
        b.cars.map((c, i) => {
          const key = `${c.carId}|${b.date}`
          const active = b.status !== "cancelled" && !taken.has(key)
          if (active) taken.add(key)
          return {
            booking_id: b.id,
            position: i,
            car_id: c.carId,
            car_name: c.carName,
            rate: c.rate,
            fleet: c.fleet === "partner" ? "partner" : null,
            owner_name: c.ownerName ?? null,
            owner_cost: c.ownerCost ?? null,
            pickup_time: c.pickupTime ?? "",
            pickup_loc: c.pickupLoc ?? "",
            stops: c.stops ?? [],
            drop_time: c.dropTime ?? "",
            drop_loc: c.dropLoc ?? "",
            hire_date: b.date,
            active,
          }
        })
      )
      await db.query(
        `INSERT INTO booking_cars (booking_id, position, car_id, car_name, rate, fleet, owner_name, owner_cost, driver_id,
           pickup_time, pickup_loc, stops, drop_time, drop_loc, hire_date, active)
         SELECT r.booking_id, r.position, r.car_id, r.car_name, r.rate, r.fleet, r.owner_name, r.owner_cost, NULL,
           r.pickup_time, r.pickup_loc, r.stops, r.drop_time, r.drop_loc, r.hire_date, r.active
         FROM jsonb_to_recordset($1::jsonb) AS r(booking_id text, position int, car_id text, car_name text, rate int,
           fleet text, owner_name text, owner_cost int, pickup_time text, pickup_loc text, stops jsonb, drop_time text,
           drop_loc text, hire_date date, active boolean)
         WHERE EXISTS (SELECT 1 FROM bookings WHERE id = r.booking_id)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify(carRows)]
      )
    }

    const ledger = payload?.ledger ?? []
    if (ledger.length) {
      await db.query(
        `INSERT INTO ledger (id, booking_id, kind, category, note, amount, date, created_at)
         SELECT r.id, r.booking_id, r.kind, r.category, r.note, r.amount, r.date, r.created_at
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, booking_id text, kind text, category text, note text,
           amount int, date date, created_at timestamptz)
         WHERE EXISTS (SELECT 1 FROM bookings WHERE id = r.booking_id)
         ON CONFLICT DO NOTHING`,
        [
          JSON.stringify(
            ledger.map((e) => ({
              id: e.id,
              booking_id: e.bookingId,
              kind: e.kind,
              category: e.category,
              note: e.note ?? "",
              amount: e.amount,
              date: e.date,
              created_at: e.createdAt,
            }))
          ),
        ]
      )
    }

    if (payload?.settings) {
      await db.query(
        "INSERT INTO kv (key, value) VALUES ('settings', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [JSON.stringify({ ...DEFAULT_SETTINGS, ...upgradeSettings(payload.settings) })]
      )
    }
    await db.query("INSERT INTO kv (key, value) VALUES ('initialized', '1') ON CONFLICT (key) DO UPDATE SET value = '1'")
    return { imported: !!payload }
  })
}

// Development convenience: the test driver from the brief. Never runs in
// production; the password is stored hashed like any other.
let devDriverChecked = false
export async function ensureDevDriver() {
  if (process.env.NODE_ENV === "production" || devDriverChecked) return
  const [seeded] = await q("SELECT 1 AS ok FROM kv WHERE key = 'dev_driver_seeded'")
  if (!seeded) {
    const hash = await hashPassword("11111")
    await q(
      `INSERT INTO users (id, name, email, phone, role, status, password_hash)
       VALUES ('drv-test', 'Test Driver', 'driver@gmail.com', '', 'driver', 'active', $1)
       ON CONFLICT DO NOTHING`,
      [hash]
    )
    await q("INSERT INTO kv (key, value) VALUES ('dev_driver_seeded', '1') ON CONFLICT (key) DO NOTHING")
  }
  devDriverChecked = true
}

// ---- Indirect expenses (not tied to a hire) ------------------------------------

function toIndirect(r: Row): IndirectExpense {
  return {
    id: String(r.id),
    date: String(r.date),
    category: String(r.category),
    carId: str(r.car_id),
    carName: String(r.car_name ?? ""),
    note: String(r.note ?? ""),
    amount: Number(r.amount),
    createdAt: String(r.created_at),
  }
}

export async function listIndirect() {
  return (await q("SELECT * FROM indirect_expenses ORDER BY date, created_at")).map(toIndirect)
}

// Keep the vehicle's name with the record (a snapshot, like hires do).
async function vehicleName(carId: string | undefined | null) {
  if (!carId) return ""
  const [car] = await q("SELECT name, color FROM cars WHERE id = $1", [carId])
  if (!car) throw new UserError("That vehicle no longer exists.")
  return `${car.name} (${car.color})`
}

export async function addIndirect(input: z.infer<typeof indirectSchema>): Promise<IndirectExpense> {
  const carName = await vehicleName(input.carId)
  const [row] = await q(
    `INSERT INTO indirect_expenses (id, date, category, car_id, car_name, note, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [uid(), input.date, input.category, input.carId ?? null, carName, input.note, input.amount]
  )
  return toIndirect(row)
}

export async function assignIndirect(input: z.infer<typeof indirectAssignSchema>): Promise<IndirectExpense> {
  const carName = await vehicleName(input.carId)
  const [row] = await q("UPDATE indirect_expenses SET car_id = $2, car_name = $3 WHERE id = $1 RETURNING *", [
    input.id,
    input.carId,
    carName,
  ])
  if (!row) throw new UserError("That expense no longer exists.")
  return toIndirect(row)
}

// Removes the entry and any receipt attached to it.
export async function removeIndirect(id: string) {
  await q("DELETE FROM indirect_expenses WHERE id = $1", [id])
  await deleteFilesOf("indirect", [id])
}

// ---- Car unavailable periods (repair, service…) ---------------------------------

// Serialises saves touching the same cars: a booking and an unavailable period
// for one car can't be saved at the same moment and both pass their checks.
async function lockCars(db: Db, carIds: string[]) {
  await db.query(
    "SELECT pg_advisory_xact_lock(k) FROM (SELECT DISTINCT hashtext('car-slot:' || c) AS k FROM unnest($1::text[]) c ORDER BY 1) s",
    [carIds]
  )
}

const STAMP = `'YYYY-MM-DD"T"HH24:MI'`

function toBlock(r: Row): CarBlock {
  return {
    id: String(r.id),
    carId: String(r.car_id),
    carName: String(r.car_name ?? ""),
    start: String(r.start),
    end: String(r.end),
    reason: String(r.reason),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at),
  }
}

const BLOCK_COLUMNS = `id, car_id, car_name, to_char(start_at, ${STAMP}) AS start, to_char(end_at, ${STAMP}) AS "end", reason, note, created_at`

export async function listBlocks() {
  return (await q(`SELECT ${BLOCK_COLUMNS} FROM car_blocks ORDER BY start_at`)).map(toBlock)
}

// Refused if the car has a hire in that time: move the hire to another car
// first, so no customer is left without a car.
export async function addBlock(input: z.infer<typeof blockSchema>): Promise<CarBlock> {
  try {
    return await tx(async (db) => {
      await lockCars(db, [input.carId])
      const { rows: cars } = await db.query("SELECT name, color FROM cars WHERE id = $1", [input.carId])
      if (!cars[0]) throw new UserError("That vehicle no longer exists.")
      const { rows: hires } = await db.query(
        `SELECT b.inv_no, b.customer, to_char(lower(bc.slot), ${STAMP}) AS start, to_char(upper(bc.slot), ${STAMP}) AS "end"
         FROM booking_cars bc JOIN bookings b ON b.id = bc.booking_id
         WHERE bc.active AND bc.car_id = $1 AND bc.slot && tsrange($2::timestamp, $3::timestamp)
         ORDER BY lower(bc.slot)`,
        [input.carId, input.start, input.end]
      )
      if (hires.length) {
        const list = hires.map((h) => `${h.inv_no} ${h.customer} (${fmtBlockRange({ start: h.start, end: h.end })})`).join("; ")
        throw new UserError(`This car has hires in that time: ${list}. Move them to another car first.`)
      }
      const { rows } = await db.query(
        `INSERT INTO car_blocks (id, car_id, car_name, start_at, end_at, reason, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${BLOCK_COLUMNS}`,
        [uid(), input.carId, `${cars[0].name} (${cars[0].color})`, input.start, input.end, input.reason, input.note]
      )
      return toBlock(rows[0])
    })
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "23P01") {
      throw new UserError("This car is already marked unavailable for part of that time.")
    }
    throw err
  }
}

export async function removeBlock(id: string) {
  await q("DELETE FROM car_blocks WHERE id = $1", [id])
}
