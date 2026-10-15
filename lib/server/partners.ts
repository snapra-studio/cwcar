import "server-only"

import { randomBytes } from "node:crypto"

import { z } from "zod"

import { uid } from "@/lib/bridal/format"
import {
  commissionLabel,
  buildQuote,
  canPrice,
  durationMinutes,
  toMin,
  type PartnerRates,
  type Quote,
} from "@/lib/partner/pricing"
import { q, tx, type Row } from "@/lib/server/db"
import { UserError } from "@/lib/server/errors"
import { insertBooking, isPublicCarFree, type BookingInput } from "@/lib/server/repo"
import { todayInBusinessTz } from "@/lib/server/today"

// Hire partner (B2B) system — the one place that reads and writes partner
// rates, commission settings, partner accounts and partner inquiries.
//
//   AUTHORITATIVE  partner_rates, kv 'commission', commission_overrides,
//                  partner_inquiries (+ its quote SNAPSHOT)
//   AUDIT/HISTORY  commission_history
//   DERIVED        availability (from bookings + unavailable periods, via
//                  the same checks as everywhere else), quotes (pricing.ts)
//
// Partners don't have accounts: they use the public /inquiry page, and a
// partner-specific commission rate is matched by the email on the inquiry.
// Only our own fleet is offered to partners. A pending inquiry never blocks
// the calendar; approving one creates a normal confirmed booking inside one
// transaction, under the same per-car lock and double-booking rules as any
// other booking.

const str = (v: unknown) => (v == null ? undefined : String(v))
const num = (v: unknown) => (v == null ? null : Number(v))

// ---------------------------------------------------------------------------
// Partner vehicle rates
// ---------------------------------------------------------------------------

export type RatedCar = { carId: string; name: string; color: string; style: string; image?: string; rates: PartnerRates; updatedAt?: string }

const ratesOf = (r: Row): PartnerRates => ({
  rate4h: num(r.rate_4h),
  rate8h: num(r.rate_8h),
  rate10h: num(r.rate_10h),
  rate12h: num(r.rate_12h),
  baseOver12h: num(r.base_over_12h),
  hourlyOver12h: num(r.hourly_over_12h),
})

// Our own cars with their partner rates (cars without rates included).
export async function listPartnerRates(): Promise<RatedCar[]> {
  const rows = await q(
    `SELECT c.id, c.name, c.color, c.style, c.image, r.rate_4h, r.rate_8h, r.rate_10h, r.rate_12h, r.base_over_12h, r.hourly_over_12h, r.updated_at
     FROM cars c LEFT JOIN partner_rates r ON r.car_id = c.id
     WHERE c.fleet = 'own' ORDER BY c.name, c.color`
  )
  return rows.map((r) => ({
    carId: String(r.id),
    name: String(r.name),
    color: String(r.color),
    style: String(r.style),
    image: str(r.image),
    rates: ratesOf(r),
    updatedAt: str(r.updated_at),
  }))
}

export async function ratesFor(carId: string): Promise<PartnerRates | null> {
  const [r] = await q("SELECT * FROM partner_rates WHERE car_id = $1", [carId])
  return r ? ratesOf(r) : null
}

const rateField = z.number().int("Use whole rupees.").min(0, "Prices can't be negative.").max(10_000_000).nullable()
export const ratesSchema = z
  .object({ rate4h: rateField, rate8h: rateField, rate10h: rateField, rate12h: rateField, baseOver12h: rateField, hourlyOver12h: rateField })
  .refine((r) => (r.baseOver12h == null) === (r.hourlyOver12h == null), {
    message: "For above 12 hours, set both the base rate and the extra hourly charge (or neither).",
  })

export async function saveRates(carId: string, rates: z.infer<typeof ratesSchema>, actor: string) {
  const [car] = await q("SELECT 1 FROM cars WHERE id = $1 AND fleet = 'own'", [carId])
  if (!car) throw new UserError("Partner rates can only be set for our own cars.")
  await q(
    `INSERT INTO partner_rates (car_id, rate_4h, rate_8h, rate_10h, rate_12h, base_over_12h, hourly_over_12h, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
     ON CONFLICT (car_id) DO UPDATE SET rate_4h = $2, rate_8h = $3, rate_10h = $4, rate_12h = $5, base_over_12h = $6,
       hourly_over_12h = $7, updated_at = now(), updated_by = $8`,
    [carId, rates.rate4h, rates.rate8h, rates.rate10h, rates.rate12h, rates.baseOver12h, rates.hourlyOver12h, actor]
  )
}

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

export type CommissionSettings = { enabled: boolean; defaultAmount: number }
export type CommissionOverride = { id: string; kind: "partner" | "vehicle"; targetId: string; targetName: string; amount: number; createdAt: string }
export type CommissionChange = { at: string; actor: string; change: string }

// Until the super admin sets them: commission on, LKR 0 (a fixed amount per hire).
export async function getCommissionSettings(): Promise<CommissionSettings> {
  const [r] = await q("SELECT value FROM kv WHERE key = 'commission'")
  const v = r ? JSON.parse(String(r.value)) : {}
  return { enabled: v.enabled ?? true, defaultAmount: Number(v.defaultAmount ?? 0) }
}

async function logCommission(actor: string, change: string, detail: unknown = {}) {
  await q("INSERT INTO commission_history (actor, change, detail) VALUES ($1, $2, $3)", [actor, change, JSON.stringify(detail)])
}

const rs = (n: number) => `LKR ${n.toLocaleString("en-LK")}`
export const amountSchema = z.number().int("Use whole rupees.").min(0, "Enter 0 or more.").max(10_000_000, "That amount is too large.")

export async function saveCommissionSettings(next: CommissionSettings, actor: string) {
  const before = await getCommissionSettings()
  await q(
    `INSERT INTO kv (key, value) VALUES ('commission', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(next)]
  )
  const parts = []
  if (before.enabled !== next.enabled) parts.push(next.enabled ? "Turned commission on" : "Turned commission off")
  if (before.defaultAmount !== next.defaultAmount) parts.push(`Default commission ${rs(before.defaultAmount)} → ${rs(next.defaultAmount)}`)
  if (parts.length) await logCommission(actor, parts.join("; "), { before, after: next })
}

export async function listOverrides(): Promise<CommissionOverride[]> {
  const rows = await q(
    `SELECT o.*, CASE WHEN o.kind = 'partner' THEN o.target_id ELSE c.name || ' (' || c.color || ')' END AS target_name,
       (SELECT company FROM partner_inquiries i WHERE o.kind = 'partner' AND lower(i.email) = o.target_id ORDER BY created_at DESC LIMIT 1) AS company
     FROM commission_overrides o
     LEFT JOIN cars c ON o.kind = 'vehicle' AND c.id = o.target_id
     ORDER BY o.kind, target_name`
  )
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as "partner" | "vehicle",
    targetId: String(r.target_id),
    targetName: r.company ? `${r.company} (${r.target_name})` : String(r.target_name ?? "(removed)"),
    amount: Number(r.amount),
    createdAt: String(r.created_at),
  }))
}

// A partner is identified by the email address on their inquiries.
export async function setOverride(kind: "partner" | "vehicle", targetId: string, amount: number, actor: string) {
  if (kind === "partner") {
    targetId = targetId.trim().toLowerCase()
    if (!z.string().email().safeParse(targetId).success) throw new UserError("Enter the partner's email address.")
  }
  const [target] =
    kind === "partner"
      ? [{ name: targetId }]
      : await q("SELECT name || ' (' || color || ')' AS name FROM cars WHERE id = $1 AND fleet = 'own'", [targetId])
  if (!target) throw new UserError("That car isn't in our fleet.")
  const [old] = await q("SELECT amount FROM commission_overrides WHERE kind = $1 AND target_id = $2", [kind, targetId])
  await q(
    `INSERT INTO commission_overrides (id, kind, target_id, amount, created_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (kind, target_id) DO UPDATE SET amount = excluded.amount, created_at = now(), created_by = excluded.created_by`,
    [uid(), kind, targetId, amount, actor]
  )
  await logCommission(
    actor,
    `${kind === "partner" ? "Partner" : "Vehicle"} ${target.name}: ${old ? `${rs(Number(old.amount))} → ` : ""}${rs(amount)}`,
    { kind, targetId, before: old ? Number(old.amount) : null, after: amount }
  )
}

export async function removeOverride(id: string, actor: string) {
  const [r] = await q("DELETE FROM commission_overrides WHERE id = $1 RETURNING kind, target_id, amount", [id])
  if (!r) throw new UserError("That rate was already removed.")
  await logCommission(actor, `Removed ${r.kind} rate (${rs(Number(r.amount))}) — the default applies again`, { kind: r.kind, targetId: r.target_id })
}

export async function listCommissionHistory(limit = 50): Promise<CommissionChange[]> {
  return (await q("SELECT at, actor, change FROM commission_history ORDER BY at DESC LIMIT $1", [limit])).map((r) => ({
    at: String(r.at),
    actor: String(r.actor),
    change: String(r.change),
  }))
}

// Which commission amount applies: the partner's own rate (by the inquiry's email),
// else the car's, else the default.
export async function resolveCommission(email: string, carId: string) {
  const settings = await getCommissionSettings()
  if (!settings.enabled) return { enabled: false, amount: 0, source: "off" as const }
  const rows = await q(
    `SELECT kind, amount FROM commission_overrides
     WHERE (kind = 'partner' AND target_id = $1) OR (kind = 'vehicle' AND target_id = $2)`,
    [email.trim().toLowerCase(), carId]
  )
  const partner = rows.find((r) => r.kind === "partner")
  const vehicle = rows.find((r) => r.kind === "vehicle")
  if (partner) return { enabled: true, amount: Number(partner.amount), source: "partner" as const }
  if (vehicle) return { enabled: true, amount: Number(vehicle.amount), source: "vehicle" as const }
  return { enabled: true, amount: settings.defaultAmount, source: "default" as const }
}

// ---------------------------------------------------------------------------
// Fleet availability for partners (no prices, no hire details)
// ---------------------------------------------------------------------------

export type PartnerFleetCar = { carId: string; name: string; color: string; style: string; image?: string; available: boolean; priced: boolean }

export async function partnerFleet(date: string, pickup: string, drop: string): Promise<PartnerFleetCar[]> {
  const minutes = durationMinutes(pickup, drop)
  const [cars, busy] = await Promise.all([
    listPartnerRates(),
    q(
      `WITH win AS (SELECT tsrange($1::date + $2::time, $1::date + $3::time) AS r)
       SELECT DISTINCT car_id FROM (
         SELECT bc.car_id FROM booking_cars bc, win WHERE bc.active AND bc.slot && win.r
         UNION ALL
         SELECT cb.car_id FROM car_blocks cb, win WHERE tsrange(cb.start_at, cb.end_at) && win.r
       ) x`,
      [date, pickup, drop]
    ),
  ])
  const taken = new Set(busy.map((r) => String(r.car_id)))
  return cars.map((c) => ({
    carId: c.carId,
    name: c.name,
    color: c.color,
    style: c.style,
    image: c.image,
    available: !taken.has(c.carId),
    priced: canPrice(c.rates, minutes),
  }))
}

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:30")
const phone = (what: string) =>
  z
    .string()
    .trim()
    .max(30)
    .refine((v) => /^[+\d][\d\s()-]{6,}$/.test(v) && v.replace(/\D/g, "").length >= 9, `Enter a valid ${what}`)

export const inquirySchema = z
  .object({
    carId: z.string().trim().min(1, "Choose a vehicle").max(80),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the hire date"),
    pickupTime: time,
    dropTime: time,
    company: z.string().trim().min(2, "Enter your hire company name").max(120),
    contactName: z.string().trim().min(2, "Enter your full name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    phone: phone("contact number"),
    whatsapp: z.union([z.literal(""), phone("WhatsApp number")]).default(""),
    pickupLoc: z.string().trim().min(2, "Enter the pick-up location").max(200),
    dropLoc: z.string().trim().min(2, "Enter the drop-off location").max(200),
    stops: z.array(z.string().trim().max(200)).max(10, "Add up to 10 stops").default([]),
    notes: z.string().trim().max(1000).default(""),
  })
  .refine((v) => toMin(v.dropTime) > toMin(v.pickupTime), {
    message: "The drop-off time must be later than the pick-up time on the same day.",
    path: ["dropTime"],
  })

export type InquiryInput = z.infer<typeof inquirySchema>

function checkDate(date: string) {
  const today = todayInBusinessTz()
  if (date < today) throw new UserError("Choose today or a later date.")
  if ((Date.parse(date) - Date.parse(today)) / 86_400_000 > 2 * 366) throw new UserError("Choose a date within the next two years.")
}

async function ownCar(carId: string) {
  const [c] = await q("SELECT id, name, color, style, plate FROM cars WHERE id = $1 AND fleet = 'own'", [carId])
  if (!c) throw new UserError("That vehicle isn't available for partner hire.")
  return { id: String(c.id), name: String(c.name), color: String(c.color), style: String(c.style), plate: String(c.plate ?? "") }
}

// The estimate shown before submitting (and recomputed on submit/approve).
export async function quoteInquiry(input: InquiryInput, quoteNo: string): Promise<Quote> {
  checkDate(input.hireDate)
  await ownCar(input.carId)
  const minutes = durationMinutes(input.pickupTime, input.dropTime)
  const rates = await ratesFor(input.carId)
  if (!canPrice(rates, minutes)) {
    throw new UserError("Partner rates for this vehicle and hire length aren't set yet. Please call us for a quotation.")
  }
  return buildQuote({ quoteNo, rates: rates!, minutes, commission: await resolveCommission(input.email, input.carId) })
}

const CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const code = (n: number) => Array.from(randomBytes(n), (b) => CODE[b % CODE.length]).join("")
// e.g. PI-261014-7KQM (inquiry) / EST-261014-X3PA (draft estimate).
export const newRef = (prefix: string) => `${prefix}-${todayInBusinessTz().replace(/-/g, "").slice(2)}-${code(4)}`

export type InquiryStatus = "pending" | "approved" | "rejected"
export type InquiryView = {
  id: string
  createdAt: string
  company: string
  contactName: string
  email: string
  phone: string
  whatsapp: string
  carId: string
  carName: string
  hireDate: string
  pickupTime: string
  dropTime: string
  durationMinutes: number
  pickupLoc: string
  dropLoc: string
  stops: string[]
  notes: string
  quote: Quote
  total: number
  commission: number
  net: number
  status: InquiryStatus
  rejectionReason: string
  decidedBy?: string
  decidedAt?: string
  bookingId?: string
  bookingInvNo?: string
  emailStatus: "none" | "pending" | "sent" | "failed"
  emailAttempts: number
  emailError: string
  emailSentAt?: string
}

function toInquiry(r: Row): InquiryView {
  return {
    id: String(r.id),
    createdAt: String(r.created_at),
    company: String(r.company),
    contactName: String(r.contact_name),
    email: String(r.email),
    phone: String(r.phone),
    whatsapp: String(r.whatsapp ?? ""),
    carId: String(r.car_id),
    carName: String(r.car_name),
    hireDate: String(r.hire_date),
    pickupTime: String(r.pickup_time),
    dropTime: String(r.drop_time),
    durationMinutes: Number(r.duration_minutes),
    pickupLoc: String(r.pickup_loc),
    dropLoc: String(r.drop_loc),
    stops: (r.stops as string[]) ?? [],
    notes: String(r.notes ?? ""),
    quote: r.quote as Quote,
    total: Number(r.total),
    commission: Number(r.commission),
    net: Number(r.net),
    status: r.status as InquiryStatus,
    rejectionReason: String(r.rejection_reason ?? ""),
    decidedBy: str(r.decided_by),
    decidedAt: str(r.decided_at),
    bookingId: str(r.booking_id),
    bookingInvNo: str(r.booking_inv_no),
    emailStatus: r.email_status as InquiryView["emailStatus"],
    emailAttempts: Number(r.email_attempts ?? 0),
    emailError: String(r.email_error ?? ""),
    emailSentAt: str(r.email_sent_at),
  }
}

const SELECT_INQ = `SELECT i.*, b.inv_no AS booking_inv_no FROM partner_inquiries i LEFT JOIN bookings b ON b.id = i.booking_id`

// Submit: validate, re-check availability, recompute and freeze the quote,
// save as "pending". Does NOT book or block the car.
export async function createInquiry(input: InquiryInput): Promise<InquiryView> {
  const car = await ownCar(input.carId)
  checkDate(input.hireDate)
  const free = await isPublicCarFree(input.carId, input.hireDate, input.pickupTime, input.dropTime)
  if (!free) throw new UserError(`The ${car.name} is no longer available for that time. Please choose another time or vehicle.`)
  const stops = input.stops.filter(Boolean)
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newRef("PI")
    const quote = await quoteInquiry(input, `Q-${id.slice(3)}`)
    try {
      const [row] = await q(
        `INSERT INTO partner_inquiries (id, company, contact_name, email, phone, whatsapp, car_id, car_name,
           hire_date, pickup_time, drop_time, duration_minutes, pickup_loc, drop_loc, stops, notes, quote, total,
           commission, net, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'pending') RETURNING *`,
        [
          id,
          input.company,
          input.contactName,
          input.email,
          input.phone,
          input.whatsapp,
          car.id,
          `${car.name} (${car.color})`,
          input.hireDate,
          input.pickupTime,
          input.dropTime,
          quote.durationMinutes,
          input.pickupLoc,
          input.dropLoc,
          JSON.stringify(stops),
          input.notes,
          JSON.stringify(quote),
          quote.total,
          quote.commission,
          quote.net,
        ]
      )
      return toInquiry(row)
    } catch (err) {
      if ((err as { code?: string }).code === "23505") continue // id clash: try another
      throw err
    }
  }
  throw new UserError("Couldn't save the inquiry. Please try again.")
}

export async function getInquiry(id: string) {
  const [r] = await q(`${SELECT_INQ} WHERE i.id = $1`, [id])
  return r ? toInquiry(r) : undefined
}

export async function listInquiries(filter: { status?: InquiryStatus } = {}) {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.status) {
    params.push(filter.status)
    where.push(`i.status = $${params.length}`)
  }
  return (await q(`${SELECT_INQ} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY i.created_at DESC LIMIT 1000`, params)).map(
    toInquiry
  )
}

// Approve: one transaction — lock the inquiry, create the confirmed booking
// through the normal booking path (availability re-checked under the per-car
// lock; the database refuses overlaps), record the partner's commission as an
// expense on that hire, then mark the inquiry approved. Any conflict rolls
// everything back and nothing changes.
export async function approveInquiry(id: string, actor: string): Promise<InquiryView> {
  try {
    await tx(async (db) => {
      const { rows } = await db.query("SELECT * FROM partner_inquiries WHERE id = $1 FOR UPDATE", [id])
      const inq = rows[0]
      if (!inq) throw new UserError("That inquiry no longer exists.")
      if (inq.status !== "pending") throw new UserError(`This inquiry is already ${inq.status}.`)
      const stops = ((inq.stops as string[]) ?? []).map((loc) => ({ time: "", loc }))
      const booking: BookingInput = {
        date: String(inq.hire_date),
        type: "Wedding",
        customer: `${inq.company} — ${inq.contact_name}`.slice(0, 120),
        phone: String(inq.phone).slice(0, 40),
        address: `Partner: ${inq.company} · ${inq.email}`.slice(0, 300),
        deco: "artificial",
        decoNotes: `Partner inquiry ${inq.id} (${inq.company}).${inq.notes ? ` Notes: ${inq.notes}` : ""}`.slice(0, 1000),
        discount: 0,
        advance: 0,
        cars: [
          {
            carId: String(inq.car_id),
            carName: String(inq.car_name),
            rate: Number(inq.total),
            pickupTime: String(inq.pickup_time),
            pickupLoc: String(inq.pickup_loc),
            stops,
            dropTime: String(inq.drop_time),
            dropLoc: String(inq.drop_loc),
          },
        ],
      }
      const created = await insertBooking(db, booking, 0, { partnerInquiryId: String(inq.id) })
      if (Number(inq.commission) > 0) {
        await db.query(
          `INSERT INTO ledger (id, booking_id, kind, category, note, amount, date, created_at)
           VALUES ($1, $2, 'expense', 'Partner commission', $3, $4, $5, now())`,
          [uid(), created.id, `${inq.company} · inquiry ${inq.id} · commission ${commissionLabel(inq.quote as Quote)}`, Number(inq.commission), String(inq.hire_date)]
        )
      }
      await db.query(
        `UPDATE partner_inquiries SET status = 'approved', decided_by = $2, decided_at = now(), booking_id = $3,
           email_status = 'pending', email_error = '' WHERE id = $1`,
        [id, actor, created.id]
      )
    })
  } catch (err) {
    if (err instanceof UserError && /Already booked|Marked unavailable/.test(err.message)) {
      throw new UserError(`Can't approve: the vehicle is no longer free at that time. ${err.message}`)
    }
    if ((err as { code?: string }).code === "23P01") {
      throw new UserError("Can't approve: another booking for this vehicle overlaps that time. Nothing was changed.")
    }
    throw err
  }
  return (await getInquiry(id))!
}

export async function rejectInquiry(id: string, reason: string, actor: string): Promise<InquiryView> {
  const [r] = await q(
    `UPDATE partner_inquiries SET status = 'rejected', rejection_reason = $2, decided_by = $3, decided_at = now(),
       email_status = 'pending', email_error = ''
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, reason.trim().slice(0, 500), actor]
  )
  if (!r) throw new UserError("Only pending inquiries can be rejected.")
  return (await getInquiry(id))!
}

export async function recordEmail(id: string, ok: boolean, error = "") {
  await q(
    `UPDATE partner_inquiries SET email_status = $2, email_attempts = email_attempts + 1, email_error = $3,
       email_sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE email_sent_at END
     WHERE id = $1`,
    [id, ok ? "sent" : "failed", error.slice(0, 300)]
  )
}

// Commission totals: approved inquiries only (pending ones aren't owed).
export async function commissionSummary() {
  const [r] = await q(
    `SELECT count(*)::int AS approved, COALESCE(sum(total), 0)::bigint AS total, COALESCE(sum(commission), 0)::bigint AS commission,
            COALESCE(sum(net), 0)::bigint AS net
     FROM partner_inquiries WHERE status = 'approved'`
  )
  return { approved: Number(r.approved), total: Number(r.total), commission: Number(r.commission), net: Number(r.net) }
}
