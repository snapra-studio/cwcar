import type { Booking, BookingInput } from "@/lib/bridal/types"

// Inquiries (lib/server/inquiries.ts), shared by the server and the screens.

// Stored step of an inquiry.
export type InquiryStatus = "pending_quotation" | "quotation_ready" | "awaiting_confirmation" | "confirmed" | "rejected"

// Still being worked on (can be edited, sent, confirmed or rejected).
export const INQUIRY_OPEN: string[] = ["pending_quotation", "quotation_ready", "awaiting_confirmation"]

// What the inquiry is now, as shown: its step, what happened to its hire
// (cancelled, removed, completed after the hire date), or expired (a
// quotation past its valid-until date with no answer).
export type InquiryDisplay = InquiryStatus | "expired" | "cancelled" | "removed" | "completed"

export const DISPLAY_LABEL: Record<InquiryDisplay, string> = {
  pending_quotation: "Pending Quotation",
  quotation_ready: "Quotation Ready",
  awaiting_confirmation: "Awaiting Confirmation",
  confirmed: "Confirmed Hire",
  rejected: "Rejected",
  cancelled: "Cancelled",
  removed: "Removed",
  completed: "Completed",
  expired: "Expired",
}

// Badge colours in the site's palette.
export const DISPLAY_TONE: Record<InquiryDisplay, string> = {
  pending_quotation: "bg-amber-100 text-amber-900",
  quotation_ready: "bg-sky-100 text-sky-900",
  awaiting_confirmation: "bg-violet-100 text-violet-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  completed: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  rejected: "bg-rose-100 text-rose-900",
  cancelled: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  removed: "bg-stone-200 text-stone-700",
  expired: "bg-stone-100 text-stone-600",
}

export type InquiryView = {
  id: string
  // Permanent reference, e.g. INQ-2026-0001. Never changes.
  ref: string
  status: InquiryStatus
  display: InquiryDisplay
  hireDate: string
  customer: string
  phone: string
  // The booking-form contents (cars, routes, prices, decoration…).
  input: BookingInput
  quotedTotal: number
  // Latest quotation version (0 = none generated yet).
  quoteVersion: number
  validUntil?: string
  createdAt: string
  createdBy: string
  createdByName: string
  sentAt?: string
  decidedAt?: string
  decidedBy?: string
  rejectReason: string
  rejectNote: string
  // The confirmed hire, once converted.
  bookingId?: string
  bookingStatus?: Booking["status"]
  closedReason?: string
  closedAt?: string
  closedBy?: string
}

export type QuotationVersion = {
  version: number
  input: BookingInput
  total: number
  validUntil: string
  createdAt: string
  createdBy: string
}

// Why a customer turned a quotation down.
export const REJECT_REASONS = [
  "Price too high",
  "Selected another rental company",
  "Vehicle not suitable",
  "Customer changed date",
  "Customer cancelled wedding/event",
  "No response",
  "Other",
] as const

export type BookingEvent = {
  action: string
  prev?: string
  next?: string
  amount?: number
  reason: string
  by: string
  at: string
}

export const EVENT_LABEL: Record<string, string> = {
  created: "Inquiry created",
  inquiry_edited: "Inquiry edited",
  quotation_generated: "Quotation generated",
  quotation_edited: "Quotation edited (new version)",
  quotation_sent: "Quotation sent",
  customer_confirmed: "Customer confirmed",
  converted: "Converted to hire",
  rejected: "Inquiry rejected",
  cancelled: "Hire cancelled",
  removed: "Hire removed",
}

export const STEP_LABEL = (s?: string) => (s ? (DISPLAY_LABEL[s as InquiryDisplay] ?? s.replace(/_/g, " ")) : "")

// The quotation as a booking, for the invoice sheet in quotation mode: same
// layout, the inquiry's reference as its number.
export function quotationAsBooking(i: Pick<InquiryView, "id" | "ref" | "createdAt">, v: Pick<QuotationVersion, "input" | "total" | "createdAt" | "version">, money: { rate: number; decoCost: number; discount: number; balance: number }): Booking {
  return {
    ...v.input,
    id: i.id,
    invNo: i.ref,
    createdAt: v.createdAt,
    revision: v.version,
    status: "confirmed",
    rate: money.rate,
    decoCost: money.decoCost,
    discount: money.discount,
    total: v.total,
    balance: money.balance,
  }
}
