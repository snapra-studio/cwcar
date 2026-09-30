import "server-only"

import { z } from "zod"

// Input validation for every write. Anything the browser sends is checked
// here before it reaches the database.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a HH:MM time")
const optTime = z.union([time, z.literal("")])
const text = (max: number) => z.string().trim().max(max)
const required = (max: number, what: string) => z.string().trim().min(1, `Add ${what}`).max(max)
const money = z
  .number({ error: "Enter an amount." })
  .int("Use whole rupees.")
  .min(0, "Amounts can't be negative.")
  .max(100_000_000, "That amount is too large.")
const id = z.string().trim().min(1).max(80)
// A photo is either a new upload (data URL, capped in size; the server moves
// it into file storage) or an already-stored file (/api/files/<id>).
const image = (maxBytes: number) =>
  z.union([
    z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image")
      .max(Math.ceil(maxBytes * 1.37), "Photo is too large"),
    z.string().regex(/^\/api\/files\/[A-Za-z0-9_-]{16,64}$/, "Unsupported image"),
  ])

export const stopSchema = z.object({ time: optTime, loc: required(200, "a stop location") })

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export const bookedCarSchema = z
  .object({
    carId: id,
    carName: required(160, "the car name"),
    rate: money,
    fleet: z.enum(["own", "partner"]).optional(),
    ownerName: text(80).optional(),
    ownerCost: money.optional(),
    driverId: id.optional(),
    pickupTime: time,
    pickupLoc: required(200, "the pick-up location"),
    stops: z.array(stopSchema).max(15),
    dropTime: time,
    dropLoc: required(200, "the drop-off location"),
  })
  // Compared as minutes, not strings. A hire must end after it starts.
  .refine((c) => minutes(c.dropTime) > minutes(c.pickupTime), {
    message: "The drop-off time must be later than the pick-up time.",
    path: ["dropTime"],
  })

export const bookingInputSchema = z.object({
  date: isoDate,
  cars: z.array(bookedCarSchema).min(1, "Pick at least one car").max(20),
  type: z.enum(["Wedding", "Homecoming"]),
  customer: required(120, "the customer name"),
  phone: required(40, "the phone number"),
  address: text(300),
  deco: z.enum(["artificial", "fresh"]),
  decoNotes: text(1000).default(""),
  // Totals are recalculated on the server; discount and advance are taken as given.
  discount: money.default(0),
  advance: money,
})

export const carSchema = z.object({
  name: required(80, "the model"),
  color: required(40, "the colour name"),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
  style: z.enum(["sedan", "vintage", "suv"]),
  plate: text(20),
  rate: money.refine((n) => n > 0, "Add the day rate"),
  image: image(3_000_000).optional(),
  fleet: z.enum(["own", "partner"]).optional(),
  ownerName: text(80).optional(),
  ownerPhone: text(40).optional(),
  ownerCost: money.optional(),
})

export const settingsSchema = z.object({
  bizName: required(120, "the business name"),
  bizPhone: text(40),
  bizAddr: text(300),
  bizEmail: z.union([z.literal(""), z.string().trim().email("Check the email").max(120)]),
  bankBranch: text(120),
  accountNo: text(40),
  accountName: text(120),
  coverImage: image(4_000_000).optional(),
})

export const ledgerSchema = z.object({
  bookingId: id,
  kind: z.enum(["income", "expense"]),
  category: required(40, "a category"),
  note: text(300),
  amount: money.refine((n) => n > 0, "Add an amount"),
  date: isoDate,
})

export const indirectSchema = z.object({
  date: isoDate,
  category: required(60, "a category"),
  carId: id.optional(),
  note: text(300),
  amount: money.refine((n) => n > 0, "Add an amount"),
})

// "YYYY-MM-DDTHH:MM" local time.
const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Use a date and time")

export const blockSchema = z
  .object({
    carId: id,
    start: stamp,
    end: stamp,
    reason: required(60, "a reason"),
    note: text(300),
  })
  .refine((b) => b.end > b.start, { message: "The end must be after the start.", path: ["end"] })
  .refine((b) => Date.parse(b.end.slice(0, 10)) - Date.parse(b.start.slice(0, 10)) <= 366 * 86_400_000, {
    message: "Mark at most a year at a time.",
    path: ["end"],
  })

// Assigns an indirect expense to a vehicle, or (null) to none.
export const indirectAssignSchema = z.object({ id, carId: id.nullable() })

const password = z.string().min(8, "Use at least 8 characters").max(200)

export const driverCreateSchema = z.object({
  name: required(80, "the driver's name"),
  email: z.string().trim().toLowerCase().email("Check the email").max(120),
  phone: text(30),
  password,
})

export const driverUpdateSchema = z.object({
  name: required(80, "the driver's name"),
  email: z.string().trim().toLowerCase().email("Check the email").max(120),
  phone: text(30),
  status: z.enum(["active", "inactive"]),
})

export const passwordSchema = password

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(200),
  password: z.string().min(1).max(200),
})

// First message of a failed parse, for showing to the user.
export const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the details and try again."
