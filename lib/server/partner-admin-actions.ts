"use server"

import { z } from "zod"

import type { PartnerRates } from "@/lib/partner/pricing"
import { UserError } from "@/lib/server/errors"
import { Forbidden, requireAdmin, requireSuperAdmin } from "@/lib/server/guard"
import { sendDecisionEmail } from "@/lib/server/partner-emails"
import {
  amountSchema,
  approveInquiry,
  listPartnerRates,
  ratesFor,
  ratesSchema,
  rejectInquiry,
  removeOverride,
  saveCommissionSettings,
  saveRates,
  setOverride,
  type InquiryView,
} from "@/lib/server/partners"

// Admin side of the hire partner system. Inquiries and partner vehicle
// prices: any admin. Commission settings: super admin only.
// Every action re-checks the admin (and their role) on the server.

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: "You don't have permission to do that." }
    if (err instanceof UserError) return { ok: false, error: err.message }
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the details." }
    console.error(err)
    return { ok: false, error: "Something went wrong. Try again." }
  }
}

const id = z.string().trim().min(1).max(80)

// Approve -> booking created (same transaction) -> approval email.
export async function approveInquiryAction(inquiryId: unknown): Promise<Result<{ inquiry: InquiryView; emailed: boolean }>> {
  return run(async () => {
    const me = await requireAdmin()
    const inquiry = await approveInquiry(id.parse(inquiryId), me.email)
    const emailed = await sendDecisionEmail(inquiry.id)
    return { inquiry: { ...inquiry, emailStatus: emailed ? "sent" : "failed" }, emailed }
  })
}

export async function rejectInquiryAction(inquiryId: unknown, reason: unknown): Promise<Result<{ inquiry: InquiryView; emailed: boolean }>> {
  return run(async () => {
    const me = await requireAdmin()
    const inquiry = await rejectInquiry(id.parse(inquiryId), z.string().max(500).parse(reason ?? ""), me.email)
    const emailed = await sendDecisionEmail(inquiry.id)
    return { inquiry: { ...inquiry, emailStatus: emailed ? "sent" : "failed" }, emailed }
  })
}

export async function resendDecisionEmailAction(inquiryId: unknown): Promise<Result<boolean>> {
  return run(async () => {
    await requireAdmin()
    return sendDecisionEmail(id.parse(inquiryId))
  })
}

// Every own car's Pricing, for the New booking form.
export async function listRatesAction(): Promise<Result<Record<string, PartnerRates>>> {
  return run(async () => {
    await requireAdmin()
    return Object.fromEntries((await listPartnerRates()).map((c) => [c.carId, c.rates]))
  })
}

// The Cars tab's "Pricing" window.
export async function getRatesAction(carId: unknown): Promise<Result<PartnerRates | null>> {
  return run(async () => {
    await requireAdmin()
    return ratesFor(id.parse(carId))
  })
}

export async function saveRatesAction(carId: unknown, rates: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireAdmin()
    await saveRates(id.parse(carId), ratesSchema.parse(rates), me.email)
    return true as const
  })
}

// ---- Commission (super admin) ----

export async function saveCommissionSettingsAction(input: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireSuperAdmin()
    const s = z.object({ enabled: z.boolean(), defaultAmount: amountSchema }).parse(input)
    await saveCommissionSettings(s, me.email)
    return true as const
  })
}

export async function setOverrideAction(input: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireSuperAdmin()
    const o = z.object({ kind: z.enum(["partner", "vehicle"]), targetId: z.string().trim().min(1).max(200), amount: amountSchema }).parse(input)
    await setOverride(o.kind, o.targetId, o.amount, me.email)
    return true as const
  })
}

export async function removeOverrideAction(overrideId: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireSuperAdmin()
    await removeOverride(id.parse(overrideId), me.email)
    return true as const
  })
}
