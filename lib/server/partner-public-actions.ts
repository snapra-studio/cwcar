"use server"

import { after } from "next/server"
import { z } from "zod"

import type { Quote } from "@/lib/partner/pricing"
import { superAdminEmails } from "@/lib/server/admins"
import { appUrl, ipKey } from "@/lib/server/app-url"
import { UserError } from "@/lib/server/errors"
import { layout, sendMail } from "@/lib/server/mailer"
import {
  createInquiry,
  inquirySchema,
  newRef,
  partnerFleet,
  quoteInquiry,
  type InquiryView,
  type PartnerFleetCar,
} from "@/lib/server/partners"
import { isPublicCarFree } from "@/lib/server/repo"
import { isLocked, recordFailure } from "@/lib/server/rate-limit"
import { todayInBusinessTz } from "@/lib/server/today"

// The public /inquiry page calls these. Anyone may check the fleet, get an
// estimate and submit an inquiry (no sign-in). A partner's own commission
// rate is matched by the email on the inquiry. Prices and commission are
// always worked out here on the server.

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: err.message }
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the details." }
    console.error(err)
    return { ok: false, error: "Something went wrong. Please try again." }
  }
}

const windowSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the hire date"),
    pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the pick-up time"),
    dropTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the drop-off time"),
  })
  .refine((w) => w.dropTime > w.pickupTime, { message: "The drop-off time must be later than the pick-up time on the same day." })

// Every own-fleet car with Available / Booked for the window (no prices).
export async function checkFleetAction(input: unknown): Promise<Result<PartnerFleetCar[]>> {
  return run(async () => {
    const w = windowSchema.parse(input)
    if (w.date < todayInBusinessTz()) throw new UserError("Choose today or a later date.")
    return partnerFleet(w.date, w.pickupTime, w.dropTime)
  })
}

// "Calculate Estimated Bill": a draft quotation (not saved).
export async function estimateAction(input: unknown): Promise<Result<Quote>> {
  return run(async () => {
    const data = inquirySchema.parse(input)
    if (!(await isPublicCarFree(data.carId, data.hireDate, data.pickupTime, data.dropTime))) {
      throw new UserError("This vehicle is no longer available for that time. Please choose another time or vehicle.")
    }
    return quoteInquiry(data, newRef("EST"))
  })
}

// "Submit Inquiry": saved as Pending Approval. Doesn't book the vehicle.
export async function submitInquiryAction(input: unknown): Promise<Result<InquiryView>> {
  return run(async () => {
    const data = inquirySchema.parse(input)
    // A brake on floods: 8 submissions per 10 minutes per address / email.
    const keys = [await ipKey(), `inquiry:${data.email}`].map((k) => (k ? `submit:${k}` : ""))
    if (isLocked(...keys)) throw new UserError("Too many inquiries in a short time. Please wait a few minutes and try again.")
    recordFailure(...keys)
    const inquiry = await createInquiry(data)
    // Let the super admins know (after answering, so the visitor doesn't wait).
    after(async () => {
      const to = (await superAdminEmails()).join(", ")
      if (!to) return
      await sendMail({
        to,
        replyTo: inquiry.email,
        subject: `New partner inquiry ${inquiry.id} — ${inquiry.company}`,
        ...(await layout({
          heading: "A new hire partner inquiry is waiting",
          lines: [
            `${inquiry.contactName} from ${inquiry.company} asked for the ${inquiry.carName} on ${inquiry.hireDate}, ${inquiry.pickupTime}–${inquiry.dropTime}.`,
            "Review it under Partner Inquiries in the admin dashboard.",
          ],
          button: { label: "Open Partner Inquiries", url: `${await appUrl()}/admin/dashboard/partners` },
          reason: "You received this because you are a super admin of the Chrish Rentals dashboard.",
        })),
      }).catch(() => {})
    })
    return inquiry
  })
}
