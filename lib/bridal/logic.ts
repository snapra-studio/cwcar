// Pure booking rules shared by the browser (admin screens) and the server
// (database, driver pages, public availability). No React, no storage.

import { addDays, fmtDate, fmtTime } from "@/lib/bridal/format"
import type { BookedCar, Booking, Car, CarBlock, LedgerEntry, Route, Settings } from "@/lib/bridal/types"

export const DEFAULT_SETTINGS: Settings = {
  bizName: "Crish Wedding Cars & Rentals",
  bizPhone: "070 10 71 777",
  bizAddr: "No 168/1, Gamameda Rd, Thudella, Jaela",
  bizEmail: "chrishweddinghires@gmail.com",
  bankBranch: "Commercial Bank - Gampaha",
  accountNo: "1001049029",
  accountName: "Chrish Wedding Cars & Rentals (Pvt) Ltd",
}

// Starter fleet for a brand-new install, editable from the Cars page.
export const DEMO_CARS: Car[] = [
  { id: "bmw-red", name: "BMW 520d", color: "Red", hex: "#C8102E", style: "sedan", plate: "CAB-5201", rate: 35000 },
  { id: "benz-white", name: "Mercedes-Benz E200", color: "White", hex: "#F2F2F0", style: "sedan", plate: "CAD-2002", rate: 40000 },
  { id: "austin-cream", name: "Austin Cambridge", color: "Ivory", hex: "#E8DDC2", style: "vintage", plate: "22-1958", rate: 30000 },
  { id: "audi-black", name: "Audi A6", color: "Black", hex: "#23252B", style: "sedan", plate: "CAF-6006", rate: 38000 },
  { id: "rr-silver", name: "Range Rover Sport", color: "Silver", hex: "#B9BEC4", style: "suv", plate: "CAH-8800", rate: 55000 },
]

export const isActive = (b: Booking) => b.status !== "cancelled"

// ---- Time-based availability ------------------------------------------------
// A car is blocked only for each hire's own time slot (pick-up to drop-off),
// so it can do several hires a day. The server enforces the same rule
// (lib/server/repo.ts + the ex_car_slot constraint); this copy drives the UI.

const DAY = 24 * 60

// "08:30" -> 510 minutes after midnight; NaN if not a valid HH:MM time.
export function toMinutes(t: string) {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN
}

// [start, end) in minutes; touching slots (8-10, 10-13) don't overlap.
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart

// A car's slot on its hire date in minutes. Older hires whose drop-off is
// earlier than pick-up ran past midnight, so their end is > 24:00; a missing
// time blocks the rest of the day. Mirrors booking_slot() in the database.
export function carSlot(c: { pickupTime: string; dropTime: string }) {
  const s = toMinutes(c.pickupTime)
  const e = toMinutes(c.dropTime)
  if (Number.isNaN(s)) return { start: 0, end: DAY }
  if (Number.isNaN(e)) return { start: s, end: DAY }
  return { start: s, end: e > s ? e : e + DAY }
}

export type Slot = { start: number; end: number; booking: Booking }

// Active slots of `carId` that fall on `date` (clipped to that day), including
// an overnight hire from the day before. `excludeId` is the booking being
// edited, so its own slot doesn't count.
export function carSlotsOn(bookings: Booking[], carId: string, date: string, excludeId?: string): Slot[] {
  const prev = addDays(date, -1)
  const out: Slot[] = []
  for (const b of bookings) {
    if (b.id === excludeId || !isActive(b) || (b.date !== date && b.date !== prev)) continue
    for (const c of b.cars) {
      if (c.carId !== carId) continue
      const { start, end } = carSlot(c)
      if (b.date === date) out.push({ start, end: Math.min(end, DAY), booking: b })
      else if (end > DAY) out.push({ start: 0, end: end - DAY, booking: b })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

// Existing slots that clash with a new start-end (minutes) on that date.
export const clashes = (bookings: Booking[], carId: string, date: string, start: number, end: number, excludeId?: string) =>
  carSlotsOn(bookings, carId, date, excludeId).filter((s) => overlaps(start, end, s.start, s.end))

// Periods `carId` is marked unavailable (repair…) on `date`, clipped to
// that day, in minutes.
export type BlockedSlot = { start: number; end: number; block: CarBlock }
export function blocksOn(blocks: CarBlock[], carId: string, date: string): BlockedSlot[] {
  const out: BlockedSlot[] = []
  for (const b of blocks) {
    const from = b.start.slice(0, 10)
    const to = b.end.slice(0, 10)
    if (b.carId !== carId || date < from || date > to) continue
    const start = date === from ? toMinutes(b.start.slice(11, 16)) : 0
    const end = date === to ? toMinutes(b.end.slice(11, 16)) : DAY
    if (end > start) out.push({ start, end, block: b })
  }
  return out.sort((a, b) => a.start - b.start)
}

// "Mon, 5 Oct 2026, 8:00 AM – 5:00 PM", "Mon, 5 Oct 2026 – Wed, 7 Oct 2026 (all day)"…
// start/end are "YYYY-MM-DDTHH:MM", end exclusive.
export function fmtBlockRange(b: { start: string; end: string }) {
  const [sd, st] = [b.start.slice(0, 10), b.start.slice(11, 16)]
  const [ed, et] = [b.end.slice(0, 10), b.end.slice(11, 16)]
  if (st === "00:00" && et === "00:00") {
    const last = addDays(ed, -1)
    return last === sd ? `${fmtDate(sd)} (all day)` : `${fmtDate(sd)} – ${fmtDate(last)} (all day)`
  }
  const endTime = et === "00:00" ? "midnight" : fmtTime(et)
  if (sd === ed || (et === "00:00" && addDays(ed, -1) === sd)) return `${fmtDate(sd)}, ${fmtTime(st)} – ${endTime}`
  return `${fmtDate(sd)} ${fmtTime(st)} – ${fmtDate(ed)} ${endTime}`
}

// Free periods between booked slots on one day, as [start, end) minutes.
export function freeGaps(slots: { start: number; end: number }[]) {
  const gaps: { start: number; end: number }[] = []
  let at = 0
  for (const s of slots.slice().sort((a, b) => a.start - b.start)) {
    if (s.start > at) gaps.push({ start: at, end: s.start })
    at = Math.max(at, s.end)
  }
  if (at < DAY) gaps.push({ start: at, end: DAY })
  return gaps
}

// 510 -> "8:30 AM"; 1440 -> "midnight".
export function fmtMinutes(m: number) {
  if (m >= DAY) return "midnight"
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

// "Before 8:00 AM", "10:00 AM – 4:00 PM", "After 8:00 PM", "All day".
export function describeGap(g: { start: number; end: number }) {
  if (g.start === 0 && g.end >= DAY) return "All day"
  if (g.start === 0) return `Before ${fmtMinutes(g.end)}`
  if (g.end >= DAY) return `After ${fmtMinutes(g.start)}`
  return `${fmtMinutes(g.start)} – ${fmtMinutes(g.end)}`
}

// ---- Money ----------------------------------------------------------------------

// The one place the booking maths lives (form, server, invoice):
//   subtotal = car hire + decoration; total = subtotal - discount;
//   balance  = total - advance (never below 0).
export function bookingMoney(i: { rate: number; decoCost: number; discount?: number; advance: number }) {
  const subtotal = i.rate + i.decoCost
  const discount = Math.min(Math.max(0, i.discount ?? 0), subtotal)
  const total = subtotal - discount
  return { subtotal, discount, total, balance: Math.max(0, total - i.advance) }
}

export const carNames = (b: Booking) => b.cars.map((c) => c.carName).join(", ")

// "8:00 AM–8:00 PM" for one car on a booking.
export function carTimes(b: Booking, carId: string) {
  const c = b.cars.find((x) => x.carId === carId)
  return c ? `${fmtTime(c.pickupTime)}–${fmtTime(c.dropTime)}` : ""
}

// Earliest pick-up across every car on the booking, for sorting.
export const startTime = (b: Booking) => b.cars.map((c) => c.pickupTime).filter(Boolean).sort()[0] ?? ""

export const sortCars = (cars: Car[]) => cars.slice().sort((a, b) => a.name.localeCompare(b.name))

// Money on one hire: what the customer pays (booking total + extra income),
// what it costs (logged expenses + what we owe partner-car owners), and profit.
export function hireMoney(b: Booking, ledger: LedgerEntry[]) {
  const entries = ledger.filter((e) => e.bookingId === b.id)
  const extraIncome = entries.filter((e) => e.kind === "income").reduce((n, e) => n + e.amount, 0)
  const expenses = entries.filter((e) => e.kind === "expense").reduce((n, e) => n + e.amount, 0)
  const partnerCost = b.cars.reduce((n, c) => n + (c.ownerCost ?? 0), 0)
  const income = b.total + extraIncome
  return {
    entries,
    hireIncome: b.total,
    extraIncome,
    expenses,
    partnerCost,
    income,
    profit: income - expenses - partnerCost,
  }
}

// Status shown to drivers and in lists; derived from the stored status and date.
export type HireStatus = "cancelled" | "completed" | "today" | "upcoming"
export function hireStatus(b: Pick<Booking, "status" | "date">, today: string): HireStatus {
  if (b.status === "cancelled") return "cancelled"
  if (b.date < today) return "completed"
  return b.date === today ? "today" : "upcoming"
}

// ---- Upgrading data saved by older versions of the app ---------------------

// Settings saved before the invoice template had email/bank fields: let the
// defaults fill anything left blank or still on the old placeholder name.
export function upgradeSettings(saved?: Partial<Settings>): Partial<Settings> {
  if (!saved || "bizEmail" in saved) return saved ?? {}
  return Object.fromEntries(Object.entries(saved).filter(([, v]) => v && v !== "Bridal Drive"))
}

// Older bookings held a single carId/carName, and later one route shared by
// every car. Move both onto each car.
export type LegacyBooking = Omit<Booking, "cars"> &
  Partial<Route> & {
    cars?: (Omit<BookedCar, keyof Route> & Partial<Route>)[]
    carId?: string
    carName?: string
  }

export function upgradeBooking(b: LegacyBooking): Booking {
  const {
    carId = "",
    carName = "",
    cars,
    pickupTime = "",
    pickupLoc = "",
    stops = [],
    dropTime = "",
    dropLoc = "",
    ...rest
  } = b
  const shared: Route = { pickupTime, pickupLoc, stops, dropTime, dropLoc }
  const list = cars ?? [{ carId, carName, rate: b.rate }]
  return {
    ...rest,
    cars: list.map((c) => (c.pickupTime === undefined ? { ...shared, ...c } : (c as BookedCar))),
  }
}

// Document expiry: "expired", "soon" (within 30 days) or "ok".
export type ExpiryStatus = "expired" | "soon" | "ok"
export function expiryStatus(expiresOn: string | undefined, today: string): ExpiryStatus | undefined {
  if (!expiresOn) return undefined
  if (expiresOn < today) return "expired"
  const days = (Date.parse(expiresOn) - Date.parse(today)) / 86_400_000
  return days <= 30 ? "soon" : "ok"
}
