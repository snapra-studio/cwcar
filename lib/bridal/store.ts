"use client"

import { useSyncExternalStore } from "react"

import { DEFAULT_SETTINGS } from "@/lib/bridal/logic"
import type { Booking, BookingInput, Car, Driver, LedgerEntry, Settings } from "@/lib/bridal/types"
import * as api from "@/lib/server/admin-actions"

// Admin screens' view of the data. The database on the server is the source of
// truth; this keeps a copy in memory so screens render instantly, and every
// change goes through an admin-only server action (lib/server/admin-actions.ts)
// before the copy is updated.

export {
  bookingFor,
  carNames,
  carTimes,
  hireMoney,
  isActive,
  sortCars,
  startTime,
} from "@/lib/bridal/logic"

// Older versions kept everything in this browser's localStorage. It is copied
// to the server once (see first run below) and left in place as a backup.
const LEGACY_KEY = "bridalDriveData"

export type BridalState = {
  ready: boolean
  // Set when the data couldn't be loaded; shown by the admin shell.
  error?: string
  cars: Car[]
  bookings: Booking[]
  ledger: LedgerEntry[]
  settings: Settings
  drivers: Driver[]
}

const EMPTY: BridalState = {
  ready: false,
  cars: [],
  bookings: [],
  ledger: [],
  settings: DEFAULT_SETTINGS,
  drivers: [],
}

let state: BridalState = EMPTY
let loading: Promise<void> | null = null
let lastLoad = 0
const listeners = new Set<() => void>()

function set(next: BridalState) {
  state = next
  listeners.forEach((l) => l())
}
const patch = (fn: (s: BridalState) => Partial<BridalState>) => set({ ...state, ...fn(state) })

function readLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function load() {
  const res = await api.loadAdminState()
  if (!res.ok) {
    set({ ...state, error: res.error })
    return
  }
  let data = res.data
  if (!data.initialized) {
    // First run on the server: bring over this browser's old data (or start
    // with the demo fleet when there is none).
    const r = await fetch("/api/admin/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local: readLegacy() }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      set({ ...state, error: body.error ?? "Could not set up the database." })
      return
    }
    data = body.state
  }
  lastLoad = Date.now()
  set({ ready: true, cars: data.cars, bookings: data.bookings, ledger: data.ledger, settings: data.settings, drivers: data.drivers })
}

function refresh() {
  loading ??= load()
    .catch(() => set({ ...state, error: "Could not reach the server. Check the connection and reload." }))
    .finally(() => {
      loading = null
    })
  return loading
}

// Pick up changes made on another device when the admin comes back to the tab.
function onVisible() {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 30_000) void refresh()
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener("visibilitychange", onVisible)
    if (!state.ready && !state.error) void refresh()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) document.removeEventListener("visibilitychange", onVisible)
  }
}

export function useBridal() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY
  )
}

// Unwraps a server action result; throws with a message the UI can show.
async function call<T>(p: Promise<api.Result<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error)
  return res.data
}

// ---- Bookings ----

export async function addBooking(input: BookingInput): Promise<Booking> {
  const b = await call(api.createBookingAction(input))
  patch((s) => ({ bookings: [...s.bookings, b] }))
  return b
}

// Keeps the invoice number and creation date; the server bumps the revision
// so the re-issued invoice is marked as revised.
export async function updateBooking(id: string, input: BookingInput): Promise<Booking> {
  const b = await call(api.updateBookingAction(id, input))
  patch((s) => ({ bookings: s.bookings.map((x) => (x.id === id ? b : x)) }))
  return b
}

export async function cancelBooking(id: string) {
  const b = await call(api.cancelBookingAction(id))
  patch((s) => ({ bookings: s.bookings.map((x) => (x.id === id ? b : x)) }))
}

// ---- Cars ----

export async function addCar(car: Omit<Car, "id">) {
  const c = await call(api.addCarAction(car))
  patch((s) => ({ cars: [...s.cars, c] }))
}

// Existing bookings keep the car name/rate they were made with, so past
// invoices don't change when the catalogue is edited.
export async function updateCar(id: string, car: Omit<Car, "id">) {
  const c = await call(api.updateCarAction(id, car))
  patch((s) => ({ cars: s.cars.map((x) => (x.id === id ? c : x)) }))
}

export async function setCarImage(id: string, image: string | undefined) {
  const c = await call(api.setCarImageAction(id, image ?? null))
  patch((s) => ({ cars: s.cars.map((x) => (x.id === id ? c : x)) }))
}

export async function removeCar(id: string) {
  await call(api.removeCarAction(id))
  patch((s) => ({ cars: s.cars.filter((x) => x.id !== id) }))
}

// ---- Settings ----

// Saves the business details; the landing photo is changed separately.
export async function saveSettings(settings: Settings) {
  const { coverImage: _cover, ...details } = settings
  void _cover
  const next = await call(api.saveSettingsAction(details))
  patch(() => ({ settings: next }))
}

export async function setCoverImage(image: string | undefined) {
  const next = await call(api.setCoverImageAction(image ?? null))
  patch(() => ({ settings: next }))
}

// ---- Income & expenses ----

export async function addLedgerEntry(entry: Omit<LedgerEntry, "id" | "createdAt">) {
  const e = await call(api.addLedgerAction(entry))
  patch((s) => ({ ledger: [...s.ledger, e] }))
  return e
}

export async function removeLedgerEntry(id: string) {
  await call(api.removeLedgerAction(id))
  patch((s) => ({ ledger: s.ledger.filter((e) => e.id !== id) }))
}

// ---- Drivers ----

export async function createDriver(input: { name: string; email: string; phone: string; password: string }) {
  const d = await call(api.createDriverAction(input))
  patch((s) => ({ drivers: [...s.drivers, d].sort((a, b) => a.name.localeCompare(b.name)) }))
  return d
}

export async function updateDriver(id: string, input: Pick<Driver, "name" | "email" | "phone" | "status">) {
  const d = await call(api.updateDriverAction(id, input))
  patch((s) => ({ drivers: s.drivers.map((x) => (x.id === id ? d : x)) }))
  return d
}

export async function setDriverPassword(id: string, password: string) {
  await call(api.setDriverPasswordAction(id, password))
}
