"use server"

import { z } from "zod"

import { appUrl } from "@/lib/server/app-url"
import { UserError } from "@/lib/server/errors"
import { Forbidden, requireAdmin, requireSuperAdmin } from "@/lib/server/guard"
import { layout, sendMail } from "@/lib/server/mailer"
import { sendDecisionEmail } from "@/lib/server/partner-emails"
import {
  approveInquiry,
  percentSchema,
  ratesSchema,
  rejectInquiry,
  removeOverride,
  saveCommissionSettings,
  saveRates,
  setOverride,
  setPartnerStatus,
  type InquiryView,
} from "@/lib/server/partners"

// Admin side of the hire partner system. Inquiries, partner accounts and
// partner vehicle prices: any admin. Commission settings: super admin only.
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

export async function saveRatesAction(carId: unknown, rates: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireAdmin()
    await saveRates(id.parse(carId), ratesSchema.parse(rates), me.email)
    return true as const
  })
}

export async function setPartnerStatusAction(partnerId: unknown, status: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireAdmin()
    const p = await setPartnerStatus(id.parse(partnerId), z.enum(["active", "suspended", "rejected"]).parse(status), me.email)
    if (p.status === "active") {
      await sendMail({
        to: p.email,
        subject: "Chrish Rentals – Your hire partner account is approved",
        ...(await layout({
          heading: `Dear ${p.contactName},`,
          lines: [
            `Your hire partner account for ${p.company} has been approved.`,
            "Sign in to check our fleet's availability, send hire inquiries and follow their status and your commission.",
          ],
          button: { label: "Sign in", url: `${await appUrl()}/partner/login` },
          reason: `You received this because ${p.email} registered as a Chrish Rentals hire partner.`,
        })),
      }).catch(() => {})
    }
    return true as const
  })
}

// ---- Commission (super admin) ----

export async function saveCommissionSettingsAction(input: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireSuperAdmin()
    const s = z.object({ enabled: z.boolean(), defaultPercent: percentSchema }).parse(input)
    await saveCommissionSettings(s, me.email)
    return true as const
  })
}

export async function setOverrideAction(input: unknown): Promise<Result<true>> {
  return run(async () => {
    const me = await requireSuperAdmin()
    const o = z.object({ kind: z.enum(["partner", "vehicle"]), targetId: id, percent: percentSchema }).parse(input)
    await setOverride(o.kind, o.targetId, o.percent, me.email)
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
