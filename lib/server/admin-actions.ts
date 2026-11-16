"use server"

import { z } from "zod"

import { managerWindow } from "@/lib/bridal/manager"
import type { AdminView } from "@/lib/server/admins"
import { deleteFile, getFile } from "@/lib/server/files"
import { Forbidden, requireAdmin, requireStaff } from "@/lib/server/guard"
import * as repo from "@/lib/server/repo"
import {
  blockSchema,
  bookingInputSchema,
  carSchema,
  driverCreateSchema,
  driverUpdateSchema,
  firstIssue,
  indirectAssignSchema,
  indirectSchema,
  ledgerSchema,
  isoDate,
  passwordSchema,
  settingsSchema,
} from "@/lib/server/schemas"
import { todayInBusinessTz } from "@/lib/server/today"

// Admin-only writes, called from the admin screens (lib/bridal/store.ts).
// Every action checks the admin session on the server before doing anything.
// Managers (a restricted admin account) are refused by run(); only the
// actions that use runStaff() are open to them, with their limits applied.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  return attempt(async () => {
    await requireAdmin()
    return fn()
  })
}

// Admins, super admins and managers. `fn` gets the signed-in account so it
// can apply a manager's limits.
async function runStaff<T>(fn: (me: AdminView) => T | Promise<T>): Promise<Result<T>> {
  return attempt(async () => fn(await requireStaff()))
}

async function attempt<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: "Your session has ended. Log in again." }
    if (err instanceof z.ZodError) return { ok: false, error: firstIssue(err) }
    if (err instanceof repo.UserError) return { ok: false, error: err.message }
    console.error(err)
    return { ok: false, error: "Something went wrong saving that. Try again." }
  }
}

const id = z.string().min(1).max(80)

// A manager's date window, from today in the business's time zone.
const windowNow = () => managerWindow(todayInBusinessTz())

// ---- Snapshot ----
// Admins get everything; a manager only what their screens need, with hires
// limited to their window (see repo.getManagerState).
export async function loadAdminState() {
  return runStaff((me) =>
    me.role === "manager" ? repo.getManagerState(windowNow()) : repo.getAdminState({ superAdmin: me.role === "super_admin" })
  )
}

// ---- Bookings ----
// Managers may book any date (the usual availability and double-booking
// checks apply); they can't edit or cancel.
export async function createBookingAction(input: unknown) {
  return runStaff(() => repo.createBooking(bookingInputSchema.parse(input)))
}

// When each car is taken on a date (times only), so a manager's booking form
// can show free cars on dates outside the hires they can see.
export async function busySlotsAction(date: unknown) {
  return runStaff(() => repo.busySlots(isoDate.parse(date)))
}
export async function updateBookingAction(bookingId: unknown, input: unknown) {
  return run(() => repo.updateBooking(id.parse(bookingId), bookingInputSchema.parse(input)))
}
// Cancelled (the customer called it off) or removed (wrong / duplicate entry):
// admins only, with a reason; the hire stays on record for the reports.
const closeReason = z.string().trim().min(3, "Give the reason (at least a few words).").max(300)
export async function cancelBookingAction(bookingId: unknown, reason: unknown) {
  return run(async () => repo.closeBooking(id.parse(bookingId), "cancelled", closeReason.parse(reason), (await requireAdmin()).email))
}
export async function removeBookingAction(bookingId: unknown, reason: unknown) {
  return run(async () => repo.closeBooking(id.parse(bookingId), "removed", closeReason.parse(reason), (await requireAdmin()).email))
}

// ---- Cars ----
export async function addCarAction(input: unknown) {
  return run(() => repo.addCar(carSchema.parse(input)))
}
export async function updateCarAction(carId: unknown, input: unknown) {
  return run(() => repo.updateCar(id.parse(carId), carSchema.parse(input)))
}
export async function setCarImageAction(carId: unknown, image: unknown) {
  return run(() => repo.setCarImage(id.parse(carId), carSchema.shape.image.parse(image ?? undefined)))
}
export async function removeCarAction(carId: unknown) {
  return run(() => repo.removeCar(id.parse(carId)))
}

// ---- Settings ----
// Invoice details (business name, bank account…): super admins only.
export async function saveSettingsAction(input: unknown) {
  return run(async () => {
    if ((await requireAdmin()).role !== "super_admin") throw new repo.UserError("Only a super admin can change the invoice details.")
    return repo.saveSettings(settingsSchema.parse(input))
  })
}
export async function setCoverImageAction(image: unknown) {
  return run(() => repo.setCoverImage(settingsSchema.shape.coverImage.parse(image ?? undefined)))
}

// ---- Income & expenses ----
// A manager may add entries, only to hires in their window, and gets back
// just the new entry (never totals).
export async function addLedgerAction(input: unknown) {
  return runStaff(async (me) => {
    const entry = ledgerSchema.parse(input)
    if (me.role === "manager" && !(await repo.bookingInWindow(entry.bookingId, windowNow()))) {
      throw new repo.UserError("You can only add entries to hires in your List Hires.")
    }
    return repo.addLedgerEntry(entry)
  })
}
export async function removeLedgerAction(entryId: unknown) {
  return run(() => repo.removeLedgerEntry(id.parse(entryId)))
}

// ---- Drivers (super admins only) ----
async function superOnly(what: string) {
  if ((await requireAdmin()).role !== "super_admin") throw new repo.UserError(`Only a super admin can ${what}.`)
}
export async function createDriverAction(input: unknown) {
  return run(async () => {
    await superOnly("add drivers")
    return repo.createDriver(driverCreateSchema.parse(input))
  })
}
export async function updateDriverAction(driverId: unknown, input: unknown) {
  return run(async () => {
    await superOnly("change drivers")
    return repo.updateDriver(id.parse(driverId), driverUpdateSchema.parse(input))
  })
}
export async function setDriverPasswordAction(driverId: unknown, password: unknown) {
  return run(async () => {
    await superOnly("change driver passwords")
    return repo.setDriverPassword(id.parse(driverId), passwordSchema.parse(password))
  })
}

// ---- Documents ----
// (Uploading goes through POST /api/files because files can be large.)
export async function deleteFileAction(fileId: unknown) {
  return run(async () => {
    const found = await getFile(id.parse(fileId))
    if (!found || ["car_image", "cover", "cover_video", "brochure"].includes(found.meta.ownerType)) {
      throw new repo.UserError("That file no longer exists.")
    }
    if (found.meta.ownerType === "driver_doc") await superOnly("remove driver documents")
    await deleteFile(found.meta.id)
  })
}

// ---- Indirect expenses ----
export async function addIndirectAction(input: unknown) {
  return run(() => repo.addIndirect(indirectSchema.parse(input)))
}
export async function assignIndirectAction(input: unknown) {
  return run(() => repo.assignIndirect(indirectAssignSchema.parse(input)))
}
export async function removeIndirectAction(entryId: unknown) {
  return run(() => repo.removeIndirect(id.parse(entryId)))
}

// ---- Car unavailable periods ----
export async function addBlockAction(input: unknown) {
  return run(() => repo.addBlock(blockSchema.parse(input)))
}
export async function removeBlockAction(blockId: unknown) {
  return run(() => repo.removeBlock(id.parse(blockId)))
}
