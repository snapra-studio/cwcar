import "server-only"

import { INQUIRY_OPEN, type InquiryDisplay } from "@/lib/bridal/inquiry"
import { q, type Row } from "@/lib/server/db"
import { INQUIRY_SELECT, inquiryView } from "@/lib/server/inquiries"
import { todayInBusinessTz } from "@/lib/server/today"

// Monthly Booking & Inquiry Report (admins and super admins).
//
// Counts by the date each thing happened, in the business's time zone: an
// inquiry created in November and rejected in December is a new inquiry in
// November and a rejection in December. Built from the audit trail
// (booking_events), so it stays right whatever happens to the inquiry later.
// Only records made through inquiries are counted (hires from before the
// inquiry system, and partner-inquiry hires, aren't). Quoted and booked
// amounts are values, not money received.

const TZ = () => process.env.APP_TIMEZONE || "Asia/Colombo"

export type ReportRow = {
  ref: string
  customer: string
  vehicles: string
  hireDate: string
  amount: number
  // Created / confirmed / rejected / cancelled / removed date (YYYY-MM-DD).
  date: string
  status: InquiryDisplay
  reason?: string
  by?: string
  ageDays?: number
}

export type MonthlyReport = {
  from: string
  to: string
  summary: {
    inquiries: number
    quotationsGenerated: number
    quotationsSent: number
    confirmed: number
    rejected: number
    cancelled: number
    removed: number
    completed: number
    pending: number
    // Of the inquiries created in the period, the share now confirmed hires.
    conversionRate: number
    quotationValue: number
    confirmedValue: number
    rejectedValue: number
    cancelledValue: number
  }
  inquiries: ReportRow[]
  confirmed: ReportRow[]
  rejected: ReportRow[]
  cancelled: ReportRow[]
  removed: ReportRow[]
  pending: ReportRow[]
}

const vehicles = (cars: unknown) => ((cars as { carName?: string }[] | null) ?? []).map((c) => c.carName ?? "").filter(Boolean).join(", ")
const dayOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))

export async function monthlyReport(from: string, to: string): Promise<MonthlyReport> {
  const tz = TZ()
  const today = todayInBusinessTz()
  const [events, created, open, completed] = await Promise.all([
    // Everything that happened to an inquiry or its hire in the period.
    q(
      `SELECT e.action, e.amount, e.reason, e.at, e.inquiry_id, COALESCE(NULLIF(a.name, ''), e.actor) AS by_name
       FROM booking_events e
       LEFT JOIN admins a ON lower(a.email) = lower(e.actor)
       WHERE e.inquiry_id IS NOT NULL AND (e.at AT TIME ZONE $3)::date BETWEEN $1 AND $2
       ORDER BY e.at, e.id`,
      [from, to, tz]
    ),
    q(`${INQUIRY_SELECT} WHERE (i.created_at AT TIME ZONE $3)::date BETWEEN $1 AND $2 ORDER BY i.created_at`, [from, to, tz]),
    // Still open now (created up to the end of the period).
    q(`${INQUIRY_SELECT} WHERE i.status = ANY($1::text[]) AND (i.created_at AT TIME ZONE $3)::date <= $2 ORDER BY i.created_at`, [
      INQUIRY_OPEN,
      to,
      tz,
    ]),
    // Confirmed hires from inquiries whose hire date has passed, in the period.
    q(
      `${INQUIRY_SELECT} WHERE b.status = 'confirmed' AND b.date BETWEEN $1 AND $2 AND b.date < $3 ORDER BY b.date`,
      [from, to, today]
    ),
  ])

  // Every inquiry an event refers to, for its customer, cars and status now.
  const ids = [...new Set(events.map((e) => String(e.inquiry_id)))]
  const byId = new Map(
    (ids.length ? await q(`${INQUIRY_SELECT} WHERE i.id = ANY($1::text[])`, [ids]) : []).map((r) => [String(r.id), inquiryView(r, today)])
  )

  const fromEvents = (action: string) =>
    events
      .filter((e) => e.action === action)
      .flatMap((e: Row): ReportRow[] => {
        const i = byId.get(String(e.inquiry_id))
        if (!i) return []
        return [
          {
            ref: i.ref,
            customer: i.customer,
            vehicles: vehicles(i.input.cars),
            hireDate: i.hireDate,
            amount: Number(e.amount ?? 0),
            date: dayOf(String(e.at), tz),
            status: i.display,
            reason: String(e.reason ?? "") || undefined,
            by: String(e.by_name),
          },
        ]
      })

  const toRow = (r: Row, date: (v: ReturnType<typeof inquiryView>) => string, amount: (v: ReturnType<typeof inquiryView>) => number) => {
    const v = inquiryView(r, today)
    return {
      ref: v.ref,
      customer: v.customer,
      vehicles: vehicles(v.input.cars),
      hireDate: v.hireDate,
      amount: amount(v),
      date: date(v),
      status: v.display,
      by: v.createdByName,
    } satisfies ReportRow
  }

  const inquiries = created.map((r) => toRow(r, (v) => dayOf(v.createdAt, tz), (v) => v.quotedTotal))
  const confirmed = fromEvents("converted")
  const rejected = fromEvents("rejected")
  const cancelled = fromEvents("cancelled")
  const removed = fromEvents("removed")
  const pending = open.map((r) => {
    const row = toRow(r, (v) => dayOf(v.createdAt, tz), (v) => v.quotedTotal)
    const age = Math.round((Date.parse(today) - Date.parse(row.date)) / 86_400_000)
    return { ...row, ageDays: Math.max(0, age) }
  })
  const count = (action: string) => events.filter((e) => e.action === action).length
  const sum = (rows: ReportRow[]) => rows.reduce((n, r) => n + r.amount, 0)
  const createdConverted = created.filter((r) => r.booking_id).length

  return {
    from,
    to,
    summary: {
      inquiries: inquiries.length,
      quotationsGenerated: count("quotation_generated"),
      quotationsSent: count("quotation_sent"),
      confirmed: confirmed.length,
      rejected: rejected.length,
      cancelled: cancelled.length,
      removed: removed.length,
      completed: completed.length,
      pending: pending.length,
      conversionRate: inquiries.length ? Math.round((createdConverted / inquiries.length) * 1000) / 10 : 0,
      quotationValue: sum(inquiries),
      confirmedValue: sum(confirmed),
      rejectedValue: sum(rejected),
      cancelledValue: sum(cancelled),
    },
    inquiries,
    confirmed,
    rejected,
    cancelled,
    removed,
    pending,
  }
}
