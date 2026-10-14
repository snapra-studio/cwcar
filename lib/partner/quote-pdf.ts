import { jsPDF } from "jspdf"

import type { QuoteDoc } from "@/components/partner/quote-sheet"
import { fmtDate, rs } from "@/lib/bridal/format"
import { commissionLabel, fmtDuration } from "@/lib/partner/pricing"

// A4 PDF of a partner inquiry's estimated quotation (same content as
// QuoteSheet). Clearly marked as a quotation, not a booking or tax invoice.

const INK: [number, number, number] = [40, 32, 24]
const MUTED: [number, number, number] = [120, 110, 98]
const BAND: [number, number, number] = [245, 238, 226]
const GOLD: [number, number, number] = [154, 116, 69]

const plain = (s: string) => s.replace(/[—–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/×/g, "x").replace(/−/g, "-")
const lkr = (n: number) => rs(n).replace(/^Rs\s?/, "LKR ")
const fmtT = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

async function logo() {
  try {
    const blob = await (await fetch("/logo.png")).blob()
    return await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = rej
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

export async function downloadQuotePdf(doc: QuoteDoc) {
  const q = doc.quote
  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  const W = 210
  const M = 16
  let y = M

  const img = await logo()
  if (img) pdf.addImage(img, "PNG", M, y, 22, 22)
  pdf.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(15).text("Chrish Rentals", M + 26, y + 9)
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text("070 107 1777  ·  www.chrishrentals.com".replace("·", "-"), M + 26, y + 15)
  pdf.setTextColor(...GOLD).setFont("helvetica", "bold").setFontSize(10).text("ESTIMATED QUOTATION", W - M, y + 6, { align: "right" })
  pdf.setTextColor(...INK).setFont("courier", "normal").setFontSize(10).text(q.quoteNo, W - M, y + 12, { align: "right" })
  pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
  if (doc.inquiryId) pdf.text(`Inquiry ${doc.inquiryId}`, W - M, y + 17, { align: "right" })
  pdf.text(`${fmtDate((doc.createdAt ?? q.calculatedAt).slice(0, 10))}  -  ${doc.status === "draft" ? "Draft estimate" : doc.status === "pending" ? "Pending approval" : doc.status === "approved" ? "Approved" : "Rejected"}`, W - M, y + 22, { align: "right" })
  y += 30
  pdf.setDrawColor(210, 196, 172).line(M, y, W - M, y)
  y += 8

  const block = (title: string, lines: string[], x: number) => {
    pdf.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED).text(title.toUpperCase(), x, y)
    pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...INK)
    lines.forEach((l, i) => pdf.text(plain(l), x, y + 6 + i * 5))
    return lines.length
  }
  const n1 = block("Hire company", [doc.company, doc.contactName, doc.email, doc.phone], M)
  const n2 = block(
    "Vehicle & time",
    [doc.carName, fmtDate(doc.hireDate), `${fmtT(doc.pickupTime)} - ${fmtT(doc.dropTime)}`, `Duration: ${fmtDuration(q.durationMinutes)}`],
    W / 2 + 4
  )
  y += 8 + Math.max(n1, n2) * 5

  const route = [`Pick-up: ${doc.pickupLoc}`, ...doc.stops.map((s, i) => `Stop ${i + 1}: ${s}`), `Drop-off: ${doc.dropLoc}`]
  pdf.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED).text("ROUTE", M, y)
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...INK)
  y += 6
  for (const r of route) {
    const lines = pdf.splitTextToSize(plain(r), W - 2 * M) as string[]
    pdf.text(lines, M, y)
    y += lines.length * 5
  }
  y += 5

  const rows: [string, string, boolean?][] = [
    [`Vehicle hire charge - ${q.tierLabel}`, lkr(q.hireCharge)],
    [q.extraHours ? `Additional charges - ${q.extraHours} extra hour(s) x ${lkr(q.extraHourly)}` : "Additional charges", lkr(q.extraCharge)],
    ["Total estimated hire amount", lkr(q.total), true],
    [`Partner commission (${commissionLabel(q)})`, `- ${lkr(q.commission)}`],
    ["Net payable to Chrish Rentals", lkr(q.net), true],
  ]
  const boxH = rows.length * 8 + 8
  pdf.setFillColor(...BAND).roundedRect(M, y, W - 2 * M, boxH, 2, 2, "F")
  let ry = y + 9
  rows.forEach(([label, value, strong], i) => {
    if (i === 2 || i === 4) {
      pdf.setDrawColor(210, 196, 172).line(M + 4, ry - 5.5, W - M - 4, ry - 5.5)
    }
    pdf.setFont("helvetica", strong ? "bold" : "normal").setFontSize(strong ? 11 : 10).setTextColor(...(strong ? INK : MUTED))
    pdf.text(plain(label), M + 5, ry)
    pdf.setTextColor(...INK).text(plain(value), W - M - 5, ry, { align: "right" })
    ry += 8
  })
  y += boxH + 10

  pdf.setDrawColor(...MUTED).setLineDashPattern([1, 1], 0).roundedRect(M, y, W - 2 * M, 18, 2, 2, "S").setLineDashPattern([], 0)
  pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
  pdf.text(
    pdf.splitTextToSize(
      "This is an ESTIMATED QUOTATION only. It is NOT a confirmed booking and NOT a tax invoice. The vehicle is reserved only after Chrish Rentals approves the inquiry and confirms by email. Prices are in Sri Lankan rupees (LKR).",
      W - 2 * M - 8
    ) as string[],
    M + 4,
    y + 6
  )
  pdf.setFontSize(8).text("Chrish Rentals  -  070 107 1777  -  www.chrishrentals.com", W / 2, 287, { align: "center" })
  pdf.save(`${doc.inquiryId ?? q.quoteNo}-estimated-quotation.pdf`)
}
