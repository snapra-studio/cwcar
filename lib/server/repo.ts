import "server-only"

import { FRESH_FLOWER_COST, pad, uid } from "@/lib/bridal/format"
import { DEFAULT_SETTINGS, DEMO_CARS, upgradeBooking, upgradeSettings, type LegacyBooking } from "@/lib/bridal/logic"
import type {
  BookedCar,
  Booking,
  Car,
  Driver,
  DriverStatus,
  LedgerEntry,
  Settings,
} from "@/lib/bridal/types"
import { db, tx } from "@/lib/server/db"
import { hashPassword } from "@/lib/server/password"
import type { z } from "zod"
import type { bookingInputSchema, carSchema, driverCreateSchema, driverUpdateSchema, ledgerSchema, settingsSchema } from "@/lib/server/schemas"

// Data access layer. Every read/write of the database goes through here, and
// callers (server actions, route handlers, server pages) do the permission
// check first via lib/server/guard.ts.

// Thrown for problems the user can fix (shown as-is in the UI).
export class UserError extends Error {}

type Row = Record<string, unknown>
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
    stops: JSON.parse(String(r.stops ?? "[]")),
    dropTime: String(r.drop_time),
    dropLoc: String(r.drop_loc),
  }
}

function toBooking(r: Row, cars: BookedCar[]): Booking {
  return {
    id: String(r.id),
    invNo: String(r.inv_no),
    createdAt: String(r.created_at),
    updatedAt: str(r.updated_at),
    revision: Number(r.revision ?? 1),
    status: r.status as Booking["status"],
    date: String(r.date),
    cars,
    type: r.type as Booking["type"],
    customer: String(r.customer),
    phone: String(r.phone),
    address: String(r.address ?? ""),
    deco: r.deco as Booking["deco"],
    rate: Number(r.rate),
    decoCost: Number(r.deco_cost),
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

// Loads bookings (optionally filtered by a WHERE on the bookings table) with
// their cars in order.
function loadBookings(where = "", params: (string | number)[] = []): Booking[] {
  const rows = db.prepare(`SELECT * FROM bookings ${where} ORDER BY date, created_at`).all(...params) as Row[]
  if (!rows.length) return []
  const ids = rows.map((r) => String(r.id))
  const carRows = db
    .prepare(`SELECT * FROM booking_cars WHERE booking_id IN (${ids.map(() => "?").join(",")}) ORDER BY position`)
    .all(...ids) as Row[]
  const byBooking = new Map<string, BookedCar[]>()
  for (const c of carRows) {
    const list = byBooking.get(String(c.booking_id)) ?? []
    list.push(toBookedCar(c))
    byBooking.set(String(c.booking_id), list)
  }
  return rows.map((r) => toBooking(r, byBooking.get(String(r.id)) ?? []))
}

// ---- Settings & flags -------------------------------------------------------

function kvGet(key: string) {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as Row | undefined
  return row ? String(row.value) : undefined
}
function kvSet(key: string, value: string) {
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    key,
    value
  )
}

export function getSettings(): Settings {
  const raw = kvGet("settings")
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) }
}

// Business details for invoices, without the landing-page photo.
export function getInvoiceSettings(): Settings {
  const { coverImage: _cover, ...rest } = getSettings()
  void _cover
  return rest
}

// Business details; the landing photo is kept unless a new one is given.
export function saveSettings(input: z.infer<typeof settingsSchema>): Settings {
  const next = { ...getSettings(), ...input }
  kvSet("settings", JSON.stringify(next))
  return next
}

export function setCoverImage(image: string | undefined): Settings {
  const next = { ...getSettings() }
  if (image) next.coverImage = image
  else delete next.coverImage
  kvSet("settings", JSON.stringify(next))
  return next
}

export const isInitialized = () => kvGet("initialized") === "1"

// ---- Admin snapshot -----------------------------------------------------------

export function getAdminState() {
  return {
    initialized: isInitialized(),
    cars: (db.prepare("SELECT * FROM cars ORDER BY name").all() as Row[]).map(toCar),
    bookings: loadBookings(),
    ledger: (db.prepare("SELECT * FROM ledger ORDER BY date, created_at").all() as Row[]).map(toLedger),
    settings: getSettings(),
    drivers: listDrivers(),
  }
}

// ---- Cars ---------------------------------------------------------------------

function writeCar(id: string, c: Omit<Car, "id">) {
  const partner = c.fleet === "partner"
  db.prepare(
    `INSERT INTO cars (id, name, color, hex, style, plate, rate, image, fleet, owner_name, owner_phone, owner_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color, hex = excluded.hex,
       style = excluded.style, plate = excluded.plate, rate = excluded.rate, image = excluded.image,
       fleet = excluded.fleet, owner_name = excluded.owner_name, owner_phone = excluded.owner_phone,
       owner_cost = excluded.owner_cost`
  ).run(
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
    partner ? (c.ownerCost ?? 0) : null
  )
}

const getCar = (id: string) => {
  const r = db.prepare("SELECT * FROM cars WHERE id = ?").get(id) as Row | undefined
  return r ? toCar(r) : undefined
}

export function addCar(input: z.infer<typeof carSchema>): Car {
  const slug = `${input.name}-${input.color}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  const id = `${slug || "car"}-${uid().slice(-4)}`
  writeCar(id, input)
  return getCar(id)!
}

// Existing bookings keep the car name/rate they were made with, so past
// invoices don't change when the catalogue is edited.
export function updateCar(id: string, input: z.infer<typeof carSchema>): Car {
  if (!getCar(id)) throw new UserError("That car no longer exists.")
  writeCar(id, input)
  return getCar(id)!
}

export function setCarImage(id: string, image: string | undefined): Car {
  const car = getCar(id)
  if (!car) throw new UserError("That car no longer exists.")
  db.prepare("UPDATE cars SET image = ? WHERE id = ?").run(image ?? null, id)
  return { ...car, image }
}

export function removeCar(id: string) {
  db.prepare("DELETE FROM cars WHERE id = ?").run(id)
}

// ---- Bookings -----------------------------------------------------------------

type BookingInput = z.infer<typeof bookingInputSchema>

// Recalculates money from the cars (never trusts totals from the browser),
// and checks every car and driver.
function prepareBooking(input: BookingInput, existing?: Booking) {
  const seen = new Set<string>()
  for (const c of input.cars) {
    if (seen.has(c.carId)) throw new UserError("The same car is on this hire twice.")
    seen.add(c.carId)
    // A car removed from the catalogue may stay on a hire it was already on.
    const onExisting = existing?.cars.some((x) => x.carId === c.carId)
    if (!getCar(c.carId) && !onExisting) throw new UserError(`${c.carName} is no longer in the fleet.`)
    if (c.driverId) {
      const d = getDriverRow(c.driverId)
      const keptSame = existing?.cars.some((x) => x.carId === c.carId && x.driverId === c.driverId)
      if (!d || (d.status !== "active" && !keptSame)) throw new UserError("Pick an active driver.")
    }
  }
  const rate = input.cars.reduce((n, c) => n + c.rate, 0)
  const decoCost = input.deco === "fresh" ? FRESH_FLOWER_COST * input.cars.length : 0
  const total = rate + decoCost
  return { rate, decoCost, total, balance: Math.max(0, total - input.advance) }
}

// Friendly double-booking check; the ux_car_day index is the hard guarantee.
function assertCarsFree(date: string, carIds: string[], excludeId?: string) {
  const clash = db
    .prepare(
      `SELECT bc.car_name FROM booking_cars bc
       WHERE bc.active = 1 AND bc.hire_date = ? AND bc.booking_id != ?
         AND bc.car_id IN (${carIds.map(() => "?").join(",")})`
    )
    .all(date, excludeId ?? "", ...carIds) as Row[]
  if (clash.length) {
    throw new UserError(`Already booked on that date: ${clash.map((r) => r.car_name).join(", ")}.`)
  }
}

function writeBookingCars(bookingId: string, date: string, active: boolean, cars: BookingInput["cars"]) {
  db.prepare("DELETE FROM booking_cars WHERE booking_id = ?").run(bookingId)
  const insert = db.prepare(
    `INSERT INTO booking_cars (booking_id, position, car_id, car_name, rate, fleet, owner_name, owner_cost, driver_id,
       pickup_time, pickup_loc, stops, drop_time, drop_loc, hire_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  cars.forEach((c, i) => {
    const partner = c.fleet === "partner"
    insert.run(
      bookingId,
      i,
      c.carId,
      c.carName,
      c.rate,
      partner ? "partner" : null,
      partner ? (c.ownerName ?? "") : null,
      partner ? (c.ownerCost ?? 0) : null,
      c.driverId ?? null,
      c.pickupTime,
      c.pickupLoc,
      JSON.stringify(c.stops),
      c.dropTime,
      c.dropLoc,
      date,
      active ? 1 : 0
    )
  })
}

// SQLite reports the ux_car_day index as a constraint error; turn it into the
// same message as the friendly check.
function guardUnique<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed: booking_cars/.test(err.message)) {
      throw new UserError("One of these cars was just booked for that date. Pick another car.")
    }
    throw err
  }
}

export const getBooking = (id: string) => loadBookings("WHERE id = ?", [id])[0]

function nextInvNo(date: string, id: string) {
  const year = date.slice(0, 4)
  const row = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE substr(date, 1, 4) = ?").get(year) as Row
  let n = Number(row.n) + 1
  // The random tail keeps numbers unique even if counts collide; loop just in case.
  for (;;) {
    const invNo = `WC-${date.replace(/-/g, "").slice(2)}-${pad(n)}${id.slice(-2).toUpperCase()}`
    if (!db.prepare("SELECT 1 FROM bookings WHERE inv_no = ?").get(invNo)) return invNo
    n += 1
  }
}

export function createBooking(input: BookingInput): Booking {
  return guardUnique(() =>
    tx(() => {
      const money = prepareBooking(input)
      assertCarsFree(input.date, input.cars.map((c) => c.carId))
      const id = uid()
      db.prepare(
        `INSERT INTO bookings (id, inv_no, created_at, revision, status, date, type, customer, phone, address, deco,
           rate, deco_cost, total, advance, balance)
         VALUES (?, ?, ?, 1, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        nextInvNo(input.date, id),
        new Date().toISOString(),
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
        money.balance
      )
      writeBookingCars(id, input.date, true, input.cars)
      return getBooking(id)!
    })
  )
}

// Keeps the invoice number and creation date; bumps the revision so the
// re-issued invoice is marked as revised.
export function updateBooking(id: string, input: BookingInput): Booking {
  return guardUnique(() =>
    tx(() => {
      const existing = getBooking(id)
      if (!existing) throw new UserError("That booking no longer exists.")
      if (existing.status === "cancelled") throw new UserError("A cancelled booking can't be edited.")
      const money = prepareBooking(input, existing)
      assertCarsFree(input.date, input.cars.map((c) => c.carId), id)
      db.prepare(
        `UPDATE bookings SET updated_at = ?, revision = revision + 1, date = ?, type = ?, customer = ?, phone = ?,
           address = ?, deco = ?, rate = ?, deco_cost = ?, total = ?, advance = ?, balance = ?
         WHERE id = ?`
      ).run(
        new Date().toISOString(),
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
        id
      )
      writeBookingCars(id, input.date, true, input.cars)
      return getBooking(id)!
    })
  )
}

// Cancelled hires stay on record but free their cars.
export function cancelBooking(id: string): Booking {
  return tx(() => {
    const existing = getBooking(id)
    if (!existing) throw new UserError("That booking no longer exists.")
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id)
    db.prepare("UPDATE booking_cars SET active = 0 WHERE booking_id = ?").run(id)
    return getBooking(id)!
  })
}

// ---- Ledger -------------------------------------------------------------------

export function addLedgerEntry(input: z.infer<typeof ledgerSchema>): LedgerEntry {
  if (!db.prepare("SELECT 1 FROM bookings WHERE id = ?").get(input.bookingId)) {
    throw new UserError("That hire no longer exists.")
  }
  const entry: LedgerEntry = { ...input, id: uid(), createdAt: new Date().toISOString() }
  db.prepare(
    "INSERT INTO ledger (id, booking_id, kind, category, note, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(entry.id, entry.bookingId, entry.kind, entry.category, entry.note, entry.amount, entry.date, entry.createdAt)
  return entry
}

export function removeLedgerEntry(id: string) {
  db.prepare("DELETE FROM ledger WHERE id = ?").run(id)
}

// ---- Drivers ------------------------------------------------------------------

const getDriverRow = (id: string) => db.prepare("SELECT * FROM users WHERE id = ? AND role = 'driver'").get(id) as Row | undefined

export const listDrivers = () =>
  (db.prepare("SELECT * FROM users WHERE role = 'driver' ORDER BY name").all() as Row[]).map(toDriver)

export function getDriver(id: string) {
  const r = getDriverRow(id)
  return r ? toDriver(r) : undefined
}

// For login only: includes the hash.
export function findDriverForLogin(email: string) {
  const r = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'driver'").get(email) as Row | undefined
  return r ? { ...toDriver(r), passwordHash: String(r.password_hash) } : undefined
}

function assertEmailFree(email: string, exceptId?: string) {
  if (process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) {
    throw new UserError("That email is the admin login. Use a different one.")
  }
  const r = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, exceptId ?? "")
  if (r) throw new UserError("Another driver already uses that email.")
}

export async function createDriver(input: z.infer<typeof driverCreateSchema>): Promise<Driver> {
  assertEmailFree(input.email)
  const id = `drv-${uid()}`
  const hash = await hashPassword(input.password)
  db.prepare(
    "INSERT INTO users (id, name, email, phone, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, 'driver', 'active', ?, ?)"
  ).run(id, input.name, input.email, input.phone, hash, new Date().toISOString())
  return getDriver(id)!
}

export function updateDriver(id: string, input: z.infer<typeof driverUpdateSchema>): Driver {
  if (!getDriverRow(id)) throw new UserError("That driver no longer exists.")
  assertEmailFree(input.email, id)
  db.prepare("UPDATE users SET name = ?, email = ?, phone = ?, status = ? WHERE id = ?").run(
    input.name,
    input.email,
    input.phone,
    input.status,
    id
  )
  return getDriver(id)!
}

export async function setDriverPassword(id: string, password: string) {
  if (!getDriverRow(id)) throw new UserError("That driver no longer exists.")
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password), id)
}

// ---- Driver views (always scoped to one driver) ---------------------------------

// A hire as a driver sees it: only the cars they drive on it.
export type DriverHire = Booking & { myCars: BookedCar[] }

function scopeToDriver(b: Booking, driverId: string): DriverHire {
  return { ...b, myCars: b.cars.filter((c) => c.driverId === driverId) }
}

// Hires from `fromDate` on where this driver drives at least one car.
export function getDriverHires(driverId: string, fromDate: string): DriverHire[] {
  return loadBookings(
    "WHERE date >= ? AND id IN (SELECT booking_id FROM booking_cars WHERE driver_id = ?)",
    [fromDate, driverId]
  ).map((b) => scopeToDriver(b, driverId))
}

// One hire, only if this driver is on it; otherwise undefined (callers 404).
export function getDriverHire(driverId: string, bookingId: string): DriverHire | undefined {
  const b = loadBookings(
    "WHERE id = ? AND id IN (SELECT booking_id FROM booking_cars WHERE driver_id = ?)",
    [bookingId, driverId]
  )[0]
  return b ? scopeToDriver(b, driverId) : undefined
}

// ---- Public availability (no customer, price, route or driver data) -----------------

export type PublicCar = Pick<Car, "id" | "name" | "color" | "hex" | "style" | "image">

export const getPublicCars = (): PublicCar[] =>
  (db.prepare("SELECT id, name, color, hex, style, image FROM cars ORDER BY name").all() as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    hex: String(r.hex),
    style: r.style as Car["style"],
    image: str(r.image),
  }))

// date -> ids of cars with an active hire that day, for from..to inclusive.
export function getBookedCarIds(from: string, to: string): Record<string, string[]> {
  const rows = db
    .prepare(
      "SELECT DISTINCT hire_date, car_id FROM booking_cars WHERE active = 1 AND hire_date BETWEEN ? AND ? ORDER BY hire_date"
    )
    .all(from, to) as Row[]
  const out: Record<string, string[]> = {}
  for (const r of rows) (out[String(r.hire_date)] ??= []).push(String(r.car_id))
  return out
}

// ---- First run ----------------------------------------------------------------

type ImportPayload = {
  cars?: Car[]
  bookings?: LegacyBooking[]
  ledger?: LedgerEntry[]
  settings?: Partial<Settings>
}

// Moves data saved in the admin's browser (older versions) into the database,
// once. With nothing to import, starts with the demo fleet.
export function initializeFrom(payload: ImportPayload | null) {
  return tx(() => {
    if (isInitialized()) return { imported: false }
    if (payload) {
      for (const c of payload.cars ?? []) writeCar(c.id, c)
      for (const legacy of payload.bookings ?? []) {
        const b = upgradeBooking(legacy)
        db.prepare(
          `INSERT OR IGNORE INTO bookings (id, inv_no, created_at, updated_at, revision, status, date, type, customer,
             phone, address, deco, rate, deco_cost, total, advance, balance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          b.id,
          b.invNo,
          b.createdAt,
          b.updatedAt ?? null,
          b.revision ?? 1,
          b.status,
          b.date,
          b.type,
          b.customer,
          b.phone,
          b.address ?? "",
          b.deco,
          b.rate,
          b.decoCost,
          b.total,
          b.advance,
          b.balance
        )
        // Old data could hold a double-booking; import cancelled or clashing
        // cars as inactive rather than failing the whole import.
        const active = b.status !== "cancelled"
        b.cars.forEach((c, i) => {
          const clash =
            active &&
            db.prepare("SELECT 1 FROM booking_cars WHERE active = 1 AND hire_date = ? AND car_id = ?").get(b.date, c.carId)
          db.prepare(
            `INSERT OR IGNORE INTO booking_cars (booking_id, position, car_id, car_name, rate, fleet, owner_name,
               owner_cost, driver_id, pickup_time, pickup_loc, stops, drop_time, drop_loc, hire_date, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            b.id,
            i,
            c.carId,
            c.carName,
            c.rate,
            c.fleet ?? null,
            c.ownerName ?? null,
            c.ownerCost ?? null,
            c.pickupTime ?? "",
            c.pickupLoc ?? "",
            JSON.stringify(c.stops ?? []),
            c.dropTime ?? "",
            c.dropLoc ?? "",
            b.date,
            active && !clash ? 1 : 0
          )
        })
      }
      for (const e of payload.ledger ?? []) {
        db.prepare(
          "INSERT OR IGNORE INTO ledger (id, booking_id, kind, category, note, amount, date, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?)"
        ).run(e.id, e.bookingId, e.kind, e.category, e.note ?? "", e.amount, e.date, e.createdAt, e.bookingId)
      }
      if (payload.settings) kvSet("settings", JSON.stringify({ ...DEFAULT_SETTINGS, ...upgradeSettings(payload.settings) }))
    } else {
      for (const c of DEMO_CARS) writeCar(c.id, c)
    }
    kvSet("initialized", "1")
    return { imported: !!payload }
  })
}

// Development convenience: the test driver from the brief. Never runs in
// production; the password is stored hashed like any other.
export async function ensureDevDriver() {
  if (process.env.NODE_ENV === "production" || kvGet("dev_driver_seeded") === "1") return
  if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get("driver@gmail.com")) {
    const hash = await hashPassword("11111")
    db.prepare(
      "INSERT INTO users (id, name, email, phone, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, 'driver', 'active', ?, ?)"
    ).run("drv-test", "Test Driver", "driver@gmail.com", "", hash, new Date().toISOString())
  }
  kvSet("dev_driver_seeded", "1")
}

// Photo, plate and look of the given cars, for the driver's hire cards.
export function getCarInfo(ids: string[]) {
  if (!ids.length) return {}
  const rows = db
    .prepare(`SELECT id, name, hex, style, image, plate FROM cars WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Row[]
  return Object.fromEntries(
    rows.map((r) => [
      String(r.id),
      { name: String(r.name), hex: String(r.hex), style: r.style as Car["style"], image: str(r.image), plate: String(r.plate ?? "") },
    ])
  )
}
