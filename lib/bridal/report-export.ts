import { DISPLAY_LABEL } from "@/lib/bridal/inquiry"
import type { MonthlyReport, ReportRow } from "@/lib/server/reports"

// PDF and Excel copies of the Monthly Booking & Inquiry Report. Every row is
// listed by its permanent inquiry reference.

type Col = { head: string; width: number; get: (r: ReportRow) => string; right?: boolean }

const money = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-LK")}`

export const SUMMARY_ROWS = (s: MonthlyReport["summary"]): [string, string][] => [
  ["Inquiries created", String(s.inquiries)],
  ["Quotations generated", String(s.quotationsGenerated)],
  ["Quotations sent", String(s.quotationsSent)],
  ["Confirmed hires", String(s.confirmed)],
  ["Rejected inquiries", String(s.rejected)],
  ["Cancelled hires", String(s.cancelled)],
  ["Removed hires", String(s.removed)],
  ["Completed hires", String(s.completed)],
  ["Pending inquiries", String(s.pending)],
  ["Inquiry conversion rate", `${s.conversionRate}%`],
  ["Total quotation value", money(s.quotationValue)],
  ["Total confirmed booking value", money(s.confirmedValue)],
  ["Total rejected quotation value", money(s.rejectedValue)],
  ["Total cancelled booking value", money(s.cancelledValue)],
]

const ref: Col = { head: "Reference", width: 30, get: (r) => r.ref }
const customer: Col = { head: "Customer", width: 40, get: (r) => r.customer }
const vehicles: Col = { head: "Vehicle", width: 50, get: (r) => r.vehicles }
const hire: Col = { head: "Hire date", width: 24, get: (r) => r.hireDate }
const amount = (head: string): Col => ({ head, width: 28, get: (r) => money(r.amount), right: true })
const date = (head: string): Col => ({ head, width: 24, get: (r) => r.date })
const status: Col = { head: "Status", width: 30, get: (r) => DISPLAY_LABEL[r.status] }
const reason: Col = { head: "Reason", width: 52, get: (r) => r.reason ?? "" }
const staff: Col = { head: "Staff", width: 34, get: (r) => r.by ?? "" }

export const SECTIONS: { key: keyof Pick<MonthlyReport, "inquiries" | "confirmed" | "rejected" | "cancelled" | "removed" | "pending">; title: string; cols: Col[] }[] = [
  { key: "inquiries", title: "1. All inquiries", cols: [ref, customer, vehicles, hire, amount("Quotation"), date("Created"), status] },
  { key: "confirmed", title: "2. Confirmed hires", cols: [ref, customer, vehicles, hire, amount("Booking value"), date("Confirmed"), status] },
  { key: "rejected", title: "3. Rejected inquiries", cols: [ref, customer, vehicles, amount("Quoted"), reason, date("Rejected"), staff] },
  { key: "cancelled", title: "4. Cancelled hires", cols: [ref, customer, vehicles, amount("Booking amount"), reason, date("Cancelled"), staff] },
  { key: "removed", title: "5. Removed hires", cols: [ref, customer, vehicles, amount("Booking amount"), reason, date("Removed"), staff] },
  {
    key: "pending",
    title: "6. Pending inquiries",
    cols: [ref, customer, vehicles, amount("Quotation"), { head: "Age (days)", width: 22, get: (r) => String(r.ageDays ?? 0), right: true }, status],
  },
]

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileBase = (r: MonthlyReport, bizName: string) => `${bizName.replace(/[^\w]+/g, "-")}-report-${r.from}-to-${r.to}`

export async function downloadReportPdf(r: MonthlyReport, bizName: string) {
  const { jsPDF } = await import("jspdf")
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 12
  let y = M

  const newPageIfNeeded = (need: number) => {
    if (y + need > H - M) {
      pdf.addPage()
      y = M
    }
  }

  pdf.setFont("helvetica", "bold").setFontSize(16).text(`${bizName} — Monthly Booking & Inquiry Report`, M, y + 4)
  y += 10
  pdf.setFont("helvetica", "normal").setFontSize(10).text(`Period: ${r.from} to ${r.to}   ·   Quoted and booking values are not money received.`, M, y)
  y += 8

  pdf.setFont("helvetica", "bold").setFontSize(12).text("Summary", M, y)
  y += 6
  pdf.setFontSize(9)
  const rows = SUMMARY_ROWS(r.summary)
  const half = Math.ceil(rows.length / 2)
  rows.forEach(([k, v], i) => {
    const x = i < half ? M : W / 2
    const yy = y + (i % half) * 5.5
    pdf.setFont("helvetica", "normal").text(k, x, yy)
    pdf.setFont("helvetica", "bold").text(v, x + 75, yy, { align: "right" })
  })
  y += half * 5.5 + 6

  for (const s of SECTIONS) {
    const list = r[s.key]
    newPageIfNeeded(20)
    pdf.setFont("helvetica", "bold").setFontSize(11).text(`${s.title} (${list.length})`, M, y)
    y += 5
    const scale = (W - 2 * M) / s.cols.reduce((n, c) => n + c.width, 0)
    const header = () => {
      pdf.setFillColor(196, 140, 90).rect(M, y - 3.6, W - 2 * M, 5.4, "F")
      pdf.setTextColor(255).setFont("helvetica", "bold").setFontSize(8)
      let x = M + 1.5
      for (const c of s.cols) {
        const w = c.width * scale
        pdf.text(c.head, c.right ? x + w - 3 : x, y, c.right ? { align: "right" } : undefined)
        x += w
      }
      pdf.setTextColor(0)
      y += 5
    }
    header()
    pdf.setFont("helvetica", "normal").setFontSize(8)
    if (!list.length) {
      pdf.setTextColor(120).text("None in this period.", M + 1.5, y)
      pdf.setTextColor(0)
      y += 6
    }
    for (const row of list) {
      const cells = s.cols.map((c) => pdf.splitTextToSize(c.get(row), c.width * scale - 3) as string[])
      const h = Math.max(...cells.map((c) => c.length)) * 3.6 + 1.4
      if (y + h > H - M) {
        pdf.addPage()
        y = M + 4
        header()
        pdf.setFont("helvetica", "normal").setFontSize(8)
      }
      let x = M + 1.5
      s.cols.forEach((c, i) => {
        const w = c.width * scale
        pdf.text(cells[i], c.right ? x + w - 3 : x, y, c.right ? { align: "right" } : undefined)
        x += w
      })
      pdf.setDrawColor(225).line(M, y + h - 3.2, W - M, y + h - 3.2)
      y += h
    }
    y += 5
  }
  save(pdf.output("blob"), `${fileBase(r, bizName)}.pdf`)
}

export async function downloadReportExcel(r: MonthlyReport, bizName: string) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const sum = wb.addWorksheet("Summary")
  sum.addRow([`${bizName} — Monthly Booking & Inquiry Report`]).font = { bold: true, size: 14 }
  sum.addRow([`Period: ${r.from} to ${r.to}`])
  sum.addRow(["Quoted and booking values are not money received."])
  sum.addRow([])
  for (const [k, v] of SUMMARY_ROWS(r.summary)) sum.addRow([k, v])
  sum.getColumn(1).width = 34
  sum.getColumn(2).width = 22
  for (const s of SECTIONS) {
    const ws = wb.addWorksheet(s.title.replace(/^\d+\.\s*/, "").slice(0, 31))
    const head = ws.addRow(s.cols.map((c) => c.head))
    head.font = { bold: true, color: { argb: "FFFFFFFF" } }
    head.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC48C5A" } }))
    for (const row of r[s.key]) ws.addRow(s.cols.map((c) => c.get(row)))
    s.cols.forEach((c, i) => (ws.getColumn(i + 1).width = Math.round(c.width * 0.75)))
  }
  const buffer = await wb.xlsx.writeBuffer()
  save(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(r, bizName)}.xlsx`)
}
