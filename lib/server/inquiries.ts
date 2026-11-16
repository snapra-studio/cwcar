import "server-only"

import type { z } from "zod"

import { FRESH_FLOWER_COST, addDays, uid } from "@/lib/bridal/format"
import { INQUIRY_OPEN, type InquiryStatus, type InquiryView, type QuotationVersion, type BookingEvent } from "@/lib/bridal/inquiry"
import { bookingMoney } from "@/lib/bridal/logic"
import { managerWindow, type DateWindow } from "@/lib/bridal/manager"
import type { Booking } from "@/lib/bridal/types"
import { q, tx, type Db, type Row } from "@/lib/server/db"
import { UserError } from "@/lib/server/errors"
import { getBooking, insertBooking, logEvent } from "@/lib/server/repo"
import type { bookingInputSchema } from "@/lib/server/schemas"
import { todayInBusinessTz } from "@/lib/server/today"

// Inquiry → quotation → customer confirmation → confirmed hire.
//
// Every inquiry gets a permanent reference (INQ-2026-0001) when it is
// created. It never changes: the quotation, the confirmed hire (bookings
// .inv_no), its invoice, the hire list and the reports all show it. An
// inquiry is not a booking: it doesn't block any car until it is converted,
// and converting runs the usual availability and double-booking checks.
// Every step is written to the append-only audit trail (booking_events).

export type InquiryInput = z.infer<typeof bookingInputSchema>

// How long a quotation stays valid.
export const QUOTE_VALID_DAYS = 14

// A staff member as recorded on inquiries and the audit trail.
export type Actor = { email: string; role: string }

const str = (v: unknown) => (v == null ? undefined : String(v))

// The quoted total, with the same maths as a booking (lib/bridal/logic.ts).
export function quoteTotal(input: InquiryInput) {
  const rate = input.cars.reduce((n, c) => n + c.rate, 0)
  const decoCost = input.deco === "fresh" ? FRESH_FLOWER_COST * input.cars.length : 0
  if (input.discount > rate + decoCost) throw new UserError("The discount can't be more than the hire amount.")
  return bookingMoney({ rate, decoCost, discount: input.discount, advance: input.advance }).total
}

// ---- Permanent reference ----------------------------------------------------

// The next INQ-YYYY-NNNN, taken inside the caller's transaction. The counter
// row is locked by the UPDATE until the transaction ends, so two inquiries
// saved at the same moment get different numbers; numbers are never reused
// (inquiries are never deleted). The sequence starts again each year.
async function nextRef(db: Db, today: string) {
  const year = today.slice(0, 4)
  const { rows } = await db.query(
    `INSERT INTO ref_counters (scope, last) VALUES ($1, 1)
     ON CONFLICT (scope) DO UPDATE SET last = ref_counters.last + 1
     RETURNING last`,
    [`INQ-${year}`]
  )
  return `INQ-${year}-${String(rows[0].last).padStart(4, "0")}`
}

// ---- Reading ----------------------------------------------------------------

export const INQUIRY_SELECT = `
  SELECT i.*, b.status AS booking_status, b.date AS booking_date, b.total AS booking_total,
         b.closed_reason, b.closed_at, b.closed_by,
         COALESCE(NULLIF(a.name, ''), i.created_by) AS created_by_name
  FROM inquiries i
  LEFT JOIN bookings b ON b.id = i.booking_id
  LEFT JOIN admins a ON lower(a.email) = lower(i.created_by)`

export function inquiryView(r: Row, today: string): InquiryView {
  const status = r.status as InquiryStatus
  const validUntil = str(r.valid_until)
  const bookingStatus = str(r.booking_status) as Booking["status"] | undefined
  const hireDate = String(r.hire_date)
  // What the inquiry is now, shown everywhere: the stored step, or what
  // happened to its hire, or "expired" for a quotation past its date.
  const display =
    status === "confirmed"
      ? bookingStatus === "cancelled" || bookingStatus === "removed"
        ? bookingStatus
        : String(r.booking_date ?? hireDate) < today
          ? "completed"
          : "confirmed"
      : (status === "quotation_ready" || status === "awaiting_confirmation") && validUntil && validUntil < today
        ? "expired"
        : status
  return {
    id: String(r.id),
    ref: String(r.ref),
    status,
    display,
    hireDate,
    customer: String(r.customer),
    phone: String(r.phone),
    input: r.input as InquiryView["input"],
    quotedTotal: Number(r.quoted_total),
    quoteVersion: Number(r.quote_version),
    validUntil,
    createdAt: String(r.created_at),
    createdBy: String(r.created_by),
    createdByName: String(r.created_by_name ?? r.created_by),
    sentAt: str(r.sent_at),
    decidedAt: str(r.decided_at),
    decidedBy: str(r.decided_by),
    rejectReason: String(r.reject_reason ?? ""),
    rejectNote: String(r.reject_note ?? ""),
    bookingId: str(r.booking_id),
    bookingStatus,
    closedReason: str(r.closed_reason) || undefined,
    closedAt: str(r.closed_at),
    closedBy: str(r.closed_by),
  }
}

// Which inquiries this staff member may see: everyone except managers sees
// all; a manager sees those for hire dates in their window, plus the ones
// they created themselves.
function scopeSql(scope: Scope, at: number) {
  return scope.manager ? `(i.hire_date BETWEEN $${at} AND $${at + 1} OR lower(i.created_by) = lower($${at + 2}))` : "TRUE"
}
function scopeParams(scope: Scope) {
  return scope.manager ? [scope.manager.window.from, scope.manager.window.to, scope.manager.email] : []
}
export type Scope = { manager?: { window: DateWindow; email: string } }

// The scope of a signed-in staff member (managers: their window and own).
export const scopeOf = (me: { role: string; email: string }): Scope =>
  me.role === "manager" ? { manager: { window: managerWindow(todayInBusinessTz()), email: me.email } } : {}

export async function listInquiries(scope: Scope): Promise<InquiryView[]> {
  const today = todayInBusinessTz()
  const rows = await q(`${INQUIRY_SELECT} WHERE ${scopeSql(scope, 1)} ORDER BY i.created_at DESC`, scopeParams(scope))
  return rows.map((r) => inquiryView(r, today))
}

// One inquiry with its quotation versions and audit trail, if the staff
// member may see it.
export async function getInquiry(id: string, scope: Scope) {
  const today = todayInBusinessTz()
  const [row] = await q(`${INQUIRY_SELECT} WHERE i.id = $1 AND ${scopeSql(scope, 2)}`, [id, ...scopeParams(scope)])
  if (!row) return undefined
  const [versions, events] = await Promise.all([
    q(
      `SELECT v.*, COALESCE(NULLIF(a.name, ''), v.created_by) AS by_name FROM quotation_versions v
       LEFT JOIN admins a ON lower(a.email) = lower(v.created_by)
       WHERE v.inquiry_id = $1 ORDER BY v.version`,
      [id]
    ),
    q(
      `SELECT e.*, COALESCE(NULLIF(a.name, ''), e.actor) AS by_name FROM booking_events e
       LEFT JOIN admins a ON lower(a.email) = lower(e.actor)
       WHERE e.inquiry_id = $1 OR e.ref = $2 ORDER BY e.at, e.id`,
      [id, row.ref]
    ),
  ])
  return {
    inquiry: inquiryView(row, today),
    versions: versions.map(
      (v): QuotationVersion => ({
        version: Number(v.version),
        input: v.input as QuotationVersion["input"],
        total: Number(v.total),
        validUntil: String(v.valid_until),
        createdAt: String(v.created_at),
        createdBy: String(v.by_name),
      })
    ),
    events: events.map(
      (e): BookingEvent => ({
        action: String(e.action),
        prev: str(e.prev_status),
        next: str(e.new_status),
        amount: e.amount == null ? undefined : Number(e.amount),
        reason: String(e.reason ?? ""),
        by: String(e.by_name),
        at: String(e.at),
      })
    ),
  }
}

// ---- Changing ---------------------------------------------------------------

// Locks the inquiry for this transaction, checking the staff member may act
// on it.
async function lock(db: Db, id: string, scope: Scope) {
  const { rows } = await db.query(`SELECT i.* FROM inquiries i WHERE i.id = $1 AND ${scopeSql(scope, 2)} FOR UPDATE`, [
    id,
    ...scopeParams(scope),
  ])
  if (!rows[0]) throw new UserError("That inquiry no longer exists.")
  return rows[0]
}

const event = (r: Row, e: { action: string; next?: string; amount?: number; reason?: string; actor: Actor; bookingId?: string }) => ({
  ref: String(r.ref),
  inquiryId: String(r.id),
  bookingId: e.bookingId,
  action: e.action,
  prev: String(r.status),
  next: e.next ?? String(r.status),
  amount: e.amount,
  reason: e.reason,
  actor: e.actor.email,
})

// Create New Inquiry: a permanent reference, status Pending Quotation. No car
// is reserved.
export async function createInquiry(input: InquiryInput, actor: Actor) {
  const total = quoteTotal(input)
  const today = todayInBusinessTz()
  const id = uid()
  const ref = await tx(async (db) => {
    const ref = await nextRef(db, today)
    await db.query(
      `INSERT INTO inquiries (id, ref, status, hire_date, customer, phone, input, quoted_total, created_by)
       VALUES ($1, $2, 'pending_quotation', $3, $4, $5, $6, $7, $8)`,
      [id, ref, input.date, input.customer, input.phone, JSON.stringify(input), total, actor.email]
    )
    await logEvent(db, { ref, inquiryId: id, action: "created", next: "pending_quotation", amount: total, actor: actor.email })
    return ref
  })
  return { id, ref }
}

// Edit the inquiry's details. Once a quotation exists, the change is issued
// as a new quotation version (same reference) that must be sent again.
export async function updateInquiry(id: string, input: InquiryInput, actor: Actor, scope: Scope) {
  const total = quoteTotal(input)
  await tx(async (db) => {
    const r = await lock(db, id, scope)
    if (!INQUIRY_OPEN.includes(r.status)) throw new UserError(`This inquiry is ${statusWord(r.status)} and can't be edited.`)
    const quoted = Number(r.quote_version) > 0
    const version = quoted ? Number(r.quote_version) + 1 : 0
    const validUntil = quoted ? addDays(todayInBusinessTz(), QUOTE_VALID_DAYS) : null
    await db.query(
      `UPDATE inquiries SET input = $2, quoted_total = $3, hire_date = $4, customer = $5, phone = $6, updated_at = now(),
         quote_version = CASE WHEN $7 > 0 THEN $7 ELSE quote_version END,
         valid_until = COALESCE($8, valid_until),
         status = CASE WHEN $7 > 0 THEN 'quotation_ready' ELSE status END
       WHERE id = $1`,
      [id, JSON.stringify(input), total, input.date, input.customer, input.phone, version, validUntil]
    )
    if (quoted) {
      await db.query(
        `INSERT INTO quotation_versions (inquiry_id, version, input, total, valid_until, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, version, JSON.stringify(input), total, validUntil, actor.email]
      )
      await logEvent(db, event(r, { action: "quotation_edited", next: "quotation_ready", amount: total, reason: `Version ${version}`, actor }))
    } else {
      await logEvent(db, event(r, { action: "inquiry_edited", amount: total, actor }))
    }
  })
}

// Generate the quotation (version 1) from the inquiry: Quotation Ready.
export async function generateQuotation(id: string, actor: Actor, scope: Scope) {
  await tx(async (db) => {
    const r = await lock(db, id, scope)
    if (Number(r.quote_version) > 0) return // already generated: nothing to do
    if (r.status !== "pending_quotation") throw new UserError(`This inquiry is ${statusWord(r.status)}.`)
    const validUntil = addDays(todayInBusinessTz(), QUOTE_VALID_DAYS)
    await db.query(
      `INSERT INTO quotation_versions (inquiry_id, version, input, total, valid_until, created_by) VALUES ($1, 1, $2, $3, $4, $5)`,
      [id, JSON.stringify(r.input), Number(r.quoted_total), validUntil, actor.email]
    )
    await db.query(
      `UPDATE inquiries SET status = 'quotation_ready', quote_version = 1, valid_until = $2, updated_at = now() WHERE id = $1`,
      [id, validUntil]
    )
    await logEvent(db, event(r, { action: "quotation_generated", next: "quotation_ready", amount: Number(r.quoted_total), actor }))
  })
}

// The quotation was sent to the customer (by any means): Awaiting
// Confirmation.
export async function markSent(id: string, actor: Actor, scope: Scope) {
  await tx(async (db) => {
    const r = await lock(db, id, scope)
    if (Number(r.quote_version) === 0) throw new UserError("Generate the quotation first.")
    if (r.status !== "quotation_ready" && r.status !== "awaiting_confirmation") {
      throw new UserError(`This inquiry is ${statusWord(r.status)}.`)
    }
    await db.query(
      `UPDATE inquiries SET status = 'awaiting_confirmation', sent_at = now(), sent_by = $2, updated_at = now() WHERE id = $1`,
      [id, actor.email]
    )
    await logEvent(
      db,
      event(r, { action: "quotation_sent", next: "awaiting_confirmation", amount: Number(r.quoted_total), reason: `Version ${r.quote_version}`, actor })
    )
  })
}

// The customer confirmed: make the confirmed hire, numbered with the same
// permanent reference. All in one transaction with the inquiry locked, so a
// double click or two staff at once can't make two hires (and the unique
// inquiries.booking_id / bookings.inv_no would refuse it anyway). The usual
// availability and double-booking checks run; if the car was taken by
// another hire, nothing changes and the reason is shown.
export async function convertInquiry(id: string, actor: Actor, scope: Scope): Promise<Booking> {
  const bookingId = await tx(async (db) => {
    const r = await lock(db, id, scope)
    if (r.booking_id) return String(r.booking_id) // already converted: the same hire
    if (r.status === "rejected") throw new UserError("This inquiry was rejected. Create a new inquiry instead.")
    if (Number(r.quote_version) === 0) throw new UserError("Generate and send the quotation before confirming.")
    let booking: Booking
    try {
      booking = await insertBooking(db, r.input as InquiryInput, 0, { inquiry: { id, ref: String(r.ref) } })
    } catch (err) {
      if (typeof err === "object" && err && (err as { code?: string }).code === "23P01") {
        throw new UserError("One of these cars was just booked for an overlapping time. The inquiry wasn't confirmed.")
      }
      if (err instanceof UserError) throw new UserError(`Can't confirm: ${err.message}`)
      throw err
    }
    await db.query(
      `UPDATE inquiries SET status = 'confirmed', booking_id = $2, decided_at = now(), decided_by = $3, updated_at = now() WHERE id = $1`,
      [id, booking.id, actor.email]
    )
    const prev = String(r.status)
    await logEvent(db, { ...event(r, { action: "customer_confirmed", next: prev, actor }), prev })
    await logEvent(db, { ...event(r, { action: "converted", next: "confirmed", amount: booking.total, bookingId: booking.id, actor }), prev })
    return booking.id
  })
  const booking = await getBooking(bookingId)
  if (!booking) throw new UserError("That hire no longer exists.")
  return booking
}

// The customer said no (before confirming). Kept for the reports.
export async function rejectInquiry(id: string, reason: string, note: string, actor: Actor, scope: Scope) {
  await tx(async (db) => {
    const r = await lock(db, id, scope)
    if (!INQUIRY_OPEN.includes(r.status)) throw new UserError(`This inquiry is ${statusWord(r.status)}.`)
    await db.query(
      `UPDATE inquiries SET status = 'rejected', reject_reason = $2, reject_note = $3, decided_at = now(), decided_by = $4, updated_at = now()
       WHERE id = $1`,
      [id, reason, note, actor.email]
    )
    await logEvent(
      db,
      event(r, { action: "rejected", next: "rejected", amount: Number(r.quoted_total), reason: note ? `${reason} — ${note}` : reason, actor })
    )
  })
}

const statusWord = (s: string) =>
  ({ confirmed: "already a confirmed hire", rejected: "rejected", pending_quotation: "waiting for its quotation" })[s] ?? s.replace(/_/g, " ")
