"use server"

import { z } from "zod"

import { UserError } from "@/lib/server/errors"
import { Forbidden, requireAdmin, requireStaff } from "@/lib/server/guard"
import { REJECT_REASONS } from "@/lib/bridal/inquiry"
import {
  convertInquiry,
  createInquiry,
  generateQuotation,
  getInquiry,
  listInquiries,
  markSent,
  rejectInquiry,
  scopeOf,
  updateInquiry,
} from "@/lib/server/inquiries"
import { monthlyReport } from "@/lib/server/reports"
import { bookingInputSchema, firstIssue, isoDate } from "@/lib/server/schemas"

// Inquiries, quotations, confirmation and the monthly report.
//   Admins and super admins: everything.
//   Managers: create, edit, quote, send, confirm and reject inquiries, but
//             only those for hire dates in their window (last 7 / next 30
//             days) or that they created; no monthly report.
// Cancelling / removing a confirmed hire stays with admins (admin-actions).

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: "You don't have permission to do that." }
    if (err instanceof z.ZodError) return { ok: false, error: firstIssue(err) }
    if (err instanceof UserError) return { ok: false, error: err.message }
    console.error(err)
    return { ok: false, error: "Something went wrong. Try again." }
  }
}

const id = z.string().min(1).max(80)

async function staff() {
  const me = await requireStaff()
  return { actor: { email: me.email, role: me.role }, scope: scopeOf(me) }
}

export async function createInquiryAction(input: unknown) {
  return run(async () => {
    const { actor } = await staff()
    return createInquiry(bookingInputSchema.parse(input), actor)
  })
}

export async function updateInquiryAction(inquiryId: unknown, input: unknown) {
  return run(async () => {
    const { actor, scope } = await staff()
    await updateInquiry(id.parse(inquiryId), bookingInputSchema.parse(input), actor, scope)
    return true as const
  })
}

export async function listInquiriesAction() {
  return run(async () => listInquiries((await staff()).scope))
}

export async function getInquiryAction(inquiryId: unknown) {
  return run(async () => {
    const found = await getInquiry(id.parse(inquiryId), (await staff()).scope)
    if (!found) throw new UserError("That inquiry no longer exists.")
    return found
  })
}

export async function generateQuotationAction(inquiryId: unknown) {
  return run(async () => {
    const { actor, scope } = await staff()
    await generateQuotation(id.parse(inquiryId), actor, scope)
    return true as const
  })
}

export async function markSentAction(inquiryId: unknown) {
  return run(async () => {
    const { actor, scope } = await staff()
    await markSent(id.parse(inquiryId), actor, scope)
    return true as const
  })
}

export async function convertInquiryAction(inquiryId: unknown) {
  return run(async () => {
    const { actor, scope } = await staff()
    const booking = await convertInquiry(id.parse(inquiryId), actor, scope)
    return { bookingId: booking.id, ref: booking.invNo }
  })
}

const rejectSchema = z.object({
  reason: z.enum(REJECT_REASONS),
  note: z.string().trim().max(500).default(""),
})

export async function rejectInquiryAction(inquiryId: unknown, input: unknown) {
  return run(async () => {
    const { actor, scope } = await staff()
    const r = rejectSchema.parse(input)
    if (r.reason === "Other" && !r.note) throw new UserError("Add a note for “Other”.")
    await rejectInquiry(id.parse(inquiryId), r.reason, r.note, actor, scope)
    return true as const
  })
}

// Monthly Booking & Inquiry Report: admins and super admins only.
export async function monthlyReportAction(from: unknown, to: unknown) {
  return run(async () => {
    await requireAdmin()
    const f = isoDate.parse(from)
    const t = isoDate.parse(to)
    if (f > t) throw new UserError("Pick a start date on or before the end date.")
    return monthlyReport(f, t)
  })
}
