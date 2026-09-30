import * as React from "react"
import Image from "next/image"

import { fmtTime, MONTHS, parseIso } from "@/lib/bridal/format"
import { bookingMoney } from "@/lib/bridal/logic"
import {
  invoiceDisplay,
  invoiceFontVars,
  invoiceSans,
} from "@/lib/bridal/invoice-fonts"
import type { Booking, Settings } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// A4 at 96 dpi. The sheet is laid out in fixed pixels so the on-screen preview
// and the downloaded PDF match the printed template exactly.
export const SHEET_W = 794
export const SHEET_H = 1123

const INK = "#6B4520"
const HEAD = "#C48C5A"
const LINE = "#C9A27E"
// Minimum height of the bordered line-items box (excluding the Balance Due row);
// it grows when an order has several cars.
const MIN_BODY_H = 200
const SUMMARY_ROW_H = 24

// Height of the totals block inside the box: one row per total, plus padding.
const summaryHeight = (rows: number) => rows * SUMMARY_ROW_H + 4

function bodyHeight(items: Line[], summaryRows: number) {
  const lines = items.reduce((n, it) => n + (it.sub ? 2 : 1), 0)
  return Math.max(MIN_BODY_H, 12 + lines * 17 + (items.length - 1) * 19 + 12 + summaryHeight(summaryRows))
}

const num = (n: number) => Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 })

const slashDate = (iso: string) => {
  if (!iso) return "-"
  const d = parseIso(iso)
  return [d.getDate(), d.getMonth() + 1].map((n) => String(n).padStart(2, "0")).join("/") +
    "/" + d.getFullYear()
}

const longDate = (iso: string) => {
  const d = parseIso(iso)
  return `${d.getFullYear()} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function hireHours(from: string, to: string) {
  if (!from || !to) return 0
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }
  let diff = mins(to) - mins(from)
  if (diff <= 0) diff += 24 * 60
  return Math.round((diff / 60) * 10) / 10
}

type Line = { title: string; sub?: string; qty: number; rate: number }

function lineItems(b: Booking): Line[] {
  const qty = Math.max(1, b.cars.length)
  return [
    ...b.cars.map((c) => {
      const hours = hireHours(c.pickupTime, c.dropTime)
      const sub = `(${longDate(b.date)}${hours ? ` - ${hours} hour` : ""})`
      return { title: c.carName, sub, qty: 1, rate: c.rate }
    }),
    b.deco === "fresh"
      ? { title: "Fresh flower decoration", qty, rate: b.decoCost / qty }
      : { title: "Artificial flower decoration", sub: "(complimentary)", qty, rate: 0 },
  ]
}

// The Crish Wedding Hires logo (public/logo.png, transparent background).
export function InvoiceLogo({ size = 124, faint = false }: { size?: number; faint?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt={faint ? "" : "Chrish Wedding Hires"}
      width={size}
      height={size}
      unoptimized
      priority
      style={{ width: size, height: size, opacity: faint ? 0.1 : 1 }}
    />
  )
}


function Rows({
  rows,
  labelWidth,
  rowHeight,
}: {
  rows: [string, string][]
  labelWidth: number
  rowHeight: number
}) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <div className="font-bold" style={{ height: rowHeight }}>
            {k}
          </div>
          <div style={{ height: rowHeight }}>: {v}</div>
        </React.Fragment>
      ))}
    </div>
  )
}

const NOTES = [
  "Booking is confirmed only after advance payment of 50%.",
  "Balance payment due before the event date.",
  "Please contact us immediately if there are any changes to the booking.",
  "Vehicles will be reserved for the above-mentioned time period. If the time exceeds, an additional charge of LKR 3,500 will be charged per hour based on the vehicle's availability (even the first 5 minutes will be charged for the whole hour).",
  "Vehicles will not be kept on start when stationary for more than 15 minutes.",
  "Deviation of the pre-agreed route will cause additional charges (LKR 400 per kilometer).",
]

export function InvoiceSheet({
  booking: b,
  settings,
  ref,
}: {
  booking: Booking
  settings: Settings
  ref?: React.Ref<HTMLDivElement>
}) {
  const items = lineItems(b)
  // Subtotal - discount = total; total - advance = balance due (bookingMoney).
  const money = bookingMoney({ rate: b.rate, decoCost: b.decoCost, discount: b.discount, advance: b.advance })
  const summary: [string, string][] = [
    ["Subtotal / Hire Amount", num(money.subtotal)],
    ...(money.discount > 0 ? ([["Discount", `(${num(money.discount)})`]] as [string, string][]) : []),
    ["Total", num(money.total)],
    ["Advance Paid", b.advance ? `(${num(b.advance)})` : "0"],
  ]
  const SUMMARY_H = summaryHeight(summary.length)
  const rev = b.revision ?? 1
  const BODY_H = bodyHeight(items, summary.length)
  const cols = "220px 174px 90px 28px 170px"
  const routes = b.cars.map((c) => ({
    name: c.carName,
    rows: [
      { label: "Pick-up", time: c.pickupTime, loc: c.pickupLoc },
      ...c.stops.map((s, i) => ({ label: `Stop ${i + 1}`, time: s.time, loc: s.loc })),
      { label: "Drop-off", time: c.dropTime, loc: c.dropLoc },
    ],
  }))
  const multi = routes.length > 1

  return (
    <div
      ref={ref}
      className={cn(invoiceFontVars, invoiceSans.className, "relative flex flex-col overflow-hidden bg-white text-[13px] leading-[18px]")}
      style={{ width: SHEET_W, minHeight: SHEET_H, color: INK }}
    >
      <div className="absolute text-right" style={{ top: 16, right: 33 }}>
        <div className="text-[38px] leading-none font-normal tracking-[0.01em]">INVOICE</div>
        {b.status === "cancelled" && (
          <div className="mt-1 text-[12px] font-bold tracking-widest text-[#B91C1C]">CANCELLED</div>
        )}
        {b.status !== "cancelled" && rev > 1 && (
          <div className="mt-1 text-[12px] font-bold tracking-widest">REVISED · REV {rev}</div>
        )}
      </div>

      <div className="absolute" style={{ top: 26, left: 40 }}>
        <InvoiceLogo size={128} />
      </div>

      {/* Company */}
      <div style={{ paddingTop: 44, marginLeft: 212 }} className="leading-[26px]">
        <Rows
          labelWidth={156}
          rowHeight={26}
          rows={[
            ["Company Name:", settings.bizName],
            ["Address", settings.bizAddr],
            ["Phone", settings.bizPhone],
            ["Email", settings.bizEmail],
          ]}
        />
      </div>

      {/* Bill to */}
      <div style={{ marginTop: 14, marginLeft: 29 }} className="text-[15px] leading-[22px] font-bold">
        Bill To:
      </div>
      <div className="flex leading-[26px]" style={{ marginLeft: 44 }}>
        <div style={{ width: 369 }}>
          <Rows
            labelWidth={158}
            rowHeight={26}
            rows={[
              ["Invoice No.", rev > 1 ? `${b.invNo} (Rev ${rev})` : b.invNo],
              ["Date", slashDate((b.updatedAt ?? b.createdAt).slice(0, 10))],
              ["Due Date", slashDate(b.date)],
            ]}
          />
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <div className="grid" style={{ gridTemplateColumns: "146px 1fr" }}>
            {(
              [
                ["Client Name", b.customer],
                ["Address", b.address],
                ["Phone", b.phone],
              ] as const
            ).map(([k, v]) => (
              <React.Fragment key={k}>
                <div className="font-bold">{k}</div>
                <div>: {v}</div>
              </React.Fragment>
            ))}
            <div className="font-bold">Email</div>
            <div />
          </div>
        </div>
      </div>

      {/* Charges */}
      <div style={{ marginTop: 15, marginLeft: 56, width: 682 }}>
        <div
          className="grid items-center text-center text-[13.5px] font-bold text-white"
          style={{ gridTemplateColumns: cols, height: 44, background: HEAD }}
        >
          <div>Description</div>
          <div>Qty</div>
          <div>Rate (LKR)</div>
          <div />
          <div>Total (LKR)</div>
        </div>

        <div className="relative" style={{ height: BODY_H + 45 }}>
          <div
            className="absolute top-0 left-0"
            style={{ width: 512, height: BODY_H, borderStyle: "solid", borderColor: LINE, borderWidth: "1px 0 1px 1px" }}
          />
          <div
            className="absolute top-0"
            style={{ left: 512, width: 170, height: BODY_H, borderStyle: "solid", borderColor: LINE, borderWidth: "1px 1px 0 1px" }}
          />

          <div className="pointer-events-none absolute flex justify-center" style={{ left: 0, width: 590, top: 20 }}>
            <InvoiceLogo size={200} faint />
          </div>

          <div className="relative grid gap-[19px]" style={{ paddingTop: 12 }}>
            {items.map((it, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: cols }}>
                <div style={{ paddingLeft: 20 }} className="leading-[17px]">
                  <div>{it.title}</div>
                  {it.sub && <div>{it.sub}</div>}
                </div>
                <div className="text-center leading-[17px]">{it.qty}</div>
                <div className="text-center leading-[17px]">{num(it.rate)}</div>
                <div />
                <div className="text-right leading-[17px]" style={{ paddingRight: 54 }}>
                  {num(it.qty * it.rate)}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 leading-[24px]" style={{ top: BODY_H - SUMMARY_H }}>
            {summary.map(([k, v]) => (
              <div key={k} className="flex">
                <div className="text-right font-bold" style={{ width: 470 }}>{k}</div>
                <div className="text-right" style={{ marginLeft: 42, width: 170, paddingRight: 54 }}>{v}</div>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 flex items-center" style={{ top: BODY_H, height: 45 }}>
            <div className="text-right font-bold" style={{ width: 470 }}>Balance Due</div>
            <div
              className="flex h-full items-center justify-end font-bold text-white"
              style={{ marginLeft: 42, width: 170, paddingRight: 54, background: HEAD }}
            >
              {num(b.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Trip details */}
      <div style={{ marginTop: 14, marginLeft: 68, marginRight: 56 }}>
        <div className="text-[15px] leading-[22px] font-bold">Trip Details</div>
        {/* One car: the full-width table. Several cars: a compact block per car, two per row. */}
        <div className={cn("mt-1 grid", multi && "grid-cols-2 gap-x-6 gap-y-2")}>
          {routes.map((r, i) => (
            <div key={i} className="min-w-0">
              {multi && <div className="text-[13px] leading-[20px] font-semibold underline underline-offset-2">{r.name}</div>}
              <div
                className={cn("grid", multi ? "text-[12px] leading-[18px]" : "leading-[21px]")}
                style={{ gridTemplateColumns: multi ? "60px 62px 1fr" : "151px 86px 1fr" }}
              >
                {r.rows.map((row) => (
                  <React.Fragment key={row.label}>
                    <div className="font-bold">{row.label}</div>
                    <div>{row.time ? fmtTime(row.time) : "-"}</div>
                    <div className="min-w-0 break-words">: {row.loc}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
        {b.decoNotes?.trim() && (
          <div className="mt-2 text-[12.5px] leading-[18px]">
            <span className="font-bold">Decoration Notes: </span>
            <span className="break-words whitespace-pre-line">{b.decoNotes.trim()}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginTop: 12, marginLeft: 68 }}>
        <div>Notes</div>
        <ul className="mt-1 list-disc text-[11px] leading-[15px]" style={{ paddingLeft: 60, paddingRight: 56 }}>
          {NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      {/* Payment */}
      <div style={{ marginTop: 14, marginLeft: 68 }}>
        <div className="text-[17px] leading-[22px] font-bold">Payment Information</div>
        <div className="leading-[27px] text-[13.5px]" style={{ marginTop: 12 }}>
          <Rows
            labelWidth={151}
            rowHeight={27}
            rows={[
              ["Bank & Branch", settings.bankBranch],
              ["Account number", settings.accountNo],
              ["Account Name", settings.accountName],
            ]}
          />
        </div>
      </div>

      <p
        className={cn(invoiceDisplay.className, "mx-auto text-center text-[22px] leading-[32px] font-bold")}
        style={{ marginTop: 20, width: 620 }}
      >
        Thank you for choosing {settings.bizName}. Wishing you a beautiful wedding day!
      </p>

      {/* Signatures, pinned to the bottom of the page */}
      <div className="relative mt-auto shrink-0" style={{ height: 96 }}>
        {[
          { left: 164, label: "Customer" },
          { left: 473, label: "Manager", sub: settings.bizName },
        ].map((s) => (
          <div key={s.label} className="absolute bottom-[18px] text-center" style={{ left: s.left - 40, width: 235 }}>
            <div className="mx-auto" style={{ width: 155, borderTop: `1px solid ${INK}` }} />
            <div className="mt-[14px] font-bold">{s.label}</div>
            <div className="text-[13.5px]">{s.sub ?? " "}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
