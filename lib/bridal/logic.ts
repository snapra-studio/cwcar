// Pure booking rules shared by the browser (admin screens) and the server
// (database, driver pages, public availability). No React, no storage.

import { fmtTime } from "@/lib/bridal/format"
import type { BookedCar, Booking, Car, LedgerEntry, Route, Settings } from "@/lib/bridal/types"

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

// The active booking that already has `carId` on `date`. One car can do one
// hire per day, so any active booking that day blocks it. `excludeId` is the
// booking being edited, so its own cars don't count as taken.
export const bookingFor = (bookings: Booking[], carId: string, date: string, excludeId?: string) =>
  bookings.find(
    (b) => b.id !== excludeId && isActive(b) && b.date === date && b.cars.some((c) => c.carId === carId)
  )

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
