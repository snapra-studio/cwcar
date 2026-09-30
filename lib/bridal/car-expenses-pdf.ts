import { jsPDF } from "jspdf"

import { fmtDate, rs } from "@/lib/bridal/format"
import type { Car, IndirectExpense, Settings } from "@/lib/bridal/types"

// A printable A4 statement of the indirect expenses booked against one
// vehicle (finance, services, washes…) for a period. Drawn as real text, so it
// runs onto as many pages as it needs.

const INK: [number, number, number] = [40, 32, 24]
const MUTED: [number, number, number] = [120, 110, 98]
const BAND: [number, number, number] = [245, 238, 226]

async function logoDataUrl() {
  try {
    const blob = await (await fetch("/logo.png")).blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

// jsPDF's built-in fonts only cover Latin-1; swap the few characters we use
// that fall outside it.
const plain = (s: string) => s.replace(/[—–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...")

export async function downloadCarExpensesPdf(opts: {
  car: Car
  entries: IndirectExpense[]
  from: string
  to: string
  settings: Settings
  receiptsFor: (id: string) => number
}) {
  const { car, from, to, settings, receiptsFor } = opts
  const entries = [...opts.entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const total = entries.reduce((n, e) => n + e.amount, 0)

  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const W = 210
  const M = 16
  let y = M

  const logo = await logoDataUrl()
  if (logo) {
    const props = doc.getImageProperties(logo)
    const h = 24
    doc.addImage(logo, "PNG", M, y, (h * props.width) / props.height, h)
  }
  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold").setFontSize(15)
  doc.text(plain(settings.bizName || "Crish Wedding Hires"), W - M, y + 6, { align: "right" })
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
  const contact = [settings.bizPhone, settings.bizEmail, settings.bizAddr].filter(Boolean).map(plain)
  contact.forEach((line, i) => doc.text(line, W - M, y + 11 + i * 4.2, { align: "right" }))
  y += 28

  doc.setDrawColor(210, 196, 172).line(M, y, W - M, y)
  y += 9
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(17)
  doc.text("Vehicle expense statement", M, y)
  y += 8
  doc.setFontSize(11)
  doc.text(plain(`${car.name} (${car.color})${car.plate ? ` - ${car.plate}` : ""}`), M, y)
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTED)
  y += 5.5
  doc.text(`Period: ${fmtDate(from)} to ${fmtDate(to)}`, M, y)
  doc.text(`Generated: ${fmtDate(new Date().toISOString().slice(0, 10))}`, W - M, y, { align: "right" })
  y += 9

  // Totals per category.
  const byCat = [...entries.reduce((m, e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount), new Map<string, number>())].sort(
    (a, b) => b[1] - a[1]
  )
  doc.setFillColor(...BAND).roundedRect(M, y, W - 2 * M, 12 + byCat.length * 5.5, 2, 2, "F")
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(10)
  doc.text("Total expenses", M + 4, y + 7)
  doc.setFontSize(13).text(rs(total), W - M - 4, y + 7.5, { align: "right" })
  doc.setFont("helvetica", "normal").setFontSize(9.5)
  byCat.forEach(([cat, amount], i) => {
    const ly = y + 13 + i * 5.5
    doc.setTextColor(...MUTED).text(plain(cat), M + 4, ly)
    doc.setTextColor(...INK).text(rs(amount), W - M - 4, ly, { align: "right" })
  })
  y += 12 + byCat.length * 5.5 + 9

  // Entries table.
  const cols = [
    { label: "Date", x: M, w: 34 },
    { label: "Category", x: M + 34, w: 42 },
    { label: "Note", x: M + 76, w: 66 },
    { label: "Receipt", x: M + 142, w: 14 },
  ]
  const amountX = W - M
  const header = () => {
    doc.setFillColor(...INK).rect(M, y - 5, W - 2 * M, 7.5, "F")
    doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(9)
    for (const c of cols) doc.text(c.label, c.x + 2, y)
    doc.text("Amount", amountX - 2, y, { align: "right" })
    y += 7.5
    doc.setFont("helvetica", "normal").setTextColor(...INK)
  }
  header()

  if (!entries.length) {
    doc.setTextColor(...MUTED).text("No expenses for this vehicle in this period.", M + 2, y + 1)
    y += 8
  }
  entries.forEach((e, i) => {
    const note = doc.splitTextToSize(plain(e.note || "-"), cols[2].w - 4) as string[]
    const cat = doc.splitTextToSize(plain(e.category), cols[1].w - 4) as string[]
    const h = Math.max(note.length, cat.length) * 4.3 + 3
    if (y + h > 297 - 22) {
      doc.addPage()
      y = M + 5
      header()
    }
    if (i % 2) doc.setFillColor(250, 246, 239).rect(M, y - 4.5, W - 2 * M, h, "F")
    doc.setFontSize(9).setTextColor(...INK)
    doc.text(fmtDate(e.date), cols[0].x + 2, y)
    doc.text(cat, cols[1].x + 2, y)
    doc.setTextColor(...MUTED).text(note, cols[2].x + 2, y)
    doc.text(receiptsFor(e.id) ? "Yes" : "-", cols[3].x + 2, y)
    doc.setTextColor(...INK).text(rs(e.amount), amountX - 2, y, { align: "right" })
    y += h
  })

  if (y + 12 > 297 - 16) {
    doc.addPage()
    y = M + 5
  }
  doc.setDrawColor(...INK).line(M, y - 2, W - M, y - 2)
  doc.setFont("helvetica", "bold").setFontSize(10.5)
  doc.text(`Total (${entries.length} entr${entries.length === 1 ? "y" : "ies"})`, M + 2, y + 4)
  doc.text(rs(total), amountX - 2, y + 4, { align: "right" })

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
    doc.text(plain(`${car.name} - expense statement`), M, 297 - 8)
    doc.text(`Page ${p} of ${pages}`, W - M, 297 - 8, { align: "right" })
  }

  const slug = `${car.name}-${car.color}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  doc.save(`${slug}_expenses_${from}_to_${to}.pdf`)
}
