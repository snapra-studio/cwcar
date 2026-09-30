"use server"

import { z } from "zod"

import { deleteFile, getFile } from "@/lib/server/files"
import { Forbidden, requireAdmin } from "@/lib/server/guard"
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
  passwordSchema,
  settingsSchema,
} from "@/lib/server/schemas"

// Admin-only writes, called from the admin screens (lib/bridal/store.ts).
// Every action checks the admin session on the server before doing anything.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    await requireAdmin()
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

// ---- Snapshot ----
export async function loadAdminState() {
  return run(() => repo.getAdminState())
}

// ---- Bookings ----
export async function createBookingAction(input: unknown) {
  return run(() => repo.createBooking(bookingInputSchema.parse(input)))
}
export async function updateBookingAction(bookingId: unknown, input: unknown) {
  return run(() => repo.updateBooking(id.parse(bookingId), bookingInputSchema.parse(input)))
}
export async function cancelBookingAction(bookingId: unknown) {
  return run(() => repo.cancelBooking(id.parse(bookingId)))
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
export async function saveSettingsAction(input: unknown) {
  return run(() => repo.saveSettings(settingsSchema.parse(input)))
}
export async function setCoverImageAction(image: unknown) {
  return run(() => repo.setCoverImage(settingsSchema.shape.coverImage.parse(image ?? undefined)))
}

// ---- Income & expenses ----
export async function addLedgerAction(input: unknown) {
  return run(() => repo.addLedgerEntry(ledgerSchema.parse(input)))
}
export async function removeLedgerAction(entryId: unknown) {
  return run(() => repo.removeLedgerEntry(id.parse(entryId)))
}

// ---- Drivers ----
export async function createDriverAction(input: unknown) {
  return run(() => repo.createDriver(driverCreateSchema.parse(input)))
}
export async function updateDriverAction(driverId: unknown, input: unknown) {
  return run(() => repo.updateDriver(id.parse(driverId), driverUpdateSchema.parse(input)))
}
export async function setDriverPasswordAction(driverId: unknown, password: unknown) {
  return run(() => repo.setDriverPassword(id.parse(driverId), passwordSchema.parse(password)))
}

// ---- Documents ----
// (Uploading goes through POST /api/files because files can be large.)
export async function deleteFileAction(fileId: unknown) {
  return run(async () => {
    const found = await getFile(id.parse(fileId))
    if (!found || found.meta.ownerType === "car_image" || found.meta.ownerType === "cover") {
      throw new repo.UserError("That file no longer exists.")
    }
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
