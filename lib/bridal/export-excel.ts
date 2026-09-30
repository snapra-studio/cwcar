import ExcelJS from "exceljs"

import { fmtTime } from "@/lib/bridal/format"
import { hireMoney, isActive, startTime } from "@/lib/bridal/store"
import type { Booking, LedgerEntry } from "@/lib/bridal/types"

const HEAD = "FFC48C5A"
const INK = "FF6B4520"
const MONEY = '#,##0;(#,##0);"-"'

const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1)
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } }
  row.alignment = { vertical: "middle" }
  row.height = 22
  sheet.views = [{ state: "frozen", ySplit: 1 }]
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: INK } }
  row.border = { top: { style: "thin", color: { argb: HEAD } } }
}

// Three sheets: one row per order (money totals), one row per car on each
// order (routes), and every income/expense entry. Cancelled orders are listed
// but left out of the totals.
export async function downloadBookingsExcel(all: Booking[], ledger: LedgerEntry[], from: string, to: string) {
  const bookings = all
    .filter((b) => b.date >= from && b.date <= to)
    .sort((a, b) => (a.date + startTime(a)).localeCompare(b.date + startTime(b)))

  const wb = new ExcelJS.Workbook()
  wb.creator = "Crish Wedding Hires"
  wb.created = new Date()

  const orders = wb.addWorksheet("Orders")
  orders.columns = [
    { header: "Hire date", key: "date", width: 12 },
    { header: "Invoice no.", key: "invNo", width: 18 },
    { header: "Rev", key: "rev", width: 5 },
    { header: "Status", key: "status", width: 11 },
    { header: "Event", key: "type", width: 12 },
    { header: "Customer", key: "customer", width: 22 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Address", key: "address", width: 30 },
    { header: "Cars", key: "cars", width: 40 },
    { header: "No. of cars", key: "count", width: 10 },
    { header: "Car hire (LKR)", key: "rate", width: 15, style: { numFmt: MONEY } },
    { header: "Decoration", key: "deco", width: 12 },
    { header: "Decoration (LKR)", key: "decoCost", width: 16, style: { numFmt: MONEY } },
    { header: "Total (LKR)", key: "total", width: 14, style: { numFmt: MONEY } },
    { header: "Advance (LKR)", key: "advance", width: 14, style: { numFmt: MONEY } },
    { header: "Balance (LKR)", key: "balance", width: 14, style: { numFmt: MONEY } },
    { header: "Extra income (LKR)", key: "extra", width: 17, style: { numFmt: MONEY } },
    { header: "Expenses (LKR)", key: "expenses", width: 15, style: { numFmt: MONEY } },
    { header: "Owner payments (LKR)", key: "owner", width: 19, style: { numFmt: MONEY } },
    { header: "Profit (LKR)", key: "profit", width: 14, style: { numFmt: MONEY } },
    { header: "Invoice date", key: "issued", width: 12 },
  ]
  for (const b of bookings) {
    const m = hireMoney(b, ledger)
    const row = orders.addRow({
      date: dmy(b.date),
      invNo: b.invNo,
      rev: b.revision ?? 1,
      status: b.status === "cancelled" ? "Cancelled" : "Confirmed",
      type: b.type,
      customer: b.customer,
      phone: b.phone,
      address: b.address,
      cars: b.cars.map((c) => c.carName).join(", "),
      count: b.cars.length,
      rate: b.rate,
      deco: b.deco === "fresh" ? "Fresh" : "Artificial",
      decoCost: b.decoCost,
      total: b.total,
      advance: b.advance,
      balance: b.balance,
      extra: m.extraIncome,
      expenses: m.expenses,
      owner: m.partnerCost,
      profit: m.profit,
      issued: dmy(b.updatedAt ?? b.createdAt),
    })
    if (!isActive(b)) row.font = { color: { argb: "FF999999" }, strike: true }
  }
  const active = bookings.filter(isActive)
  const sum = (k: "rate" | "decoCost" | "total" | "advance" | "balance") =>
    active.reduce((n, b) => n + b[k], 0)
  const money = active.map((b) => hireMoney(b, ledger))
  const sumM = (k: "extraIncome" | "expenses" | "partnerCost" | "profit") => money.reduce((n, m) => n + m[k], 0)
  orders.addRow({})
  styleTotal(
    orders.addRow({
      customer: `Total (${active.length} confirmed)`,
      count: active.reduce((n, b) => n + b.cars.length, 0),
      rate: sum("rate"),
      decoCost: sum("decoCost"),
      total: sum("total"),
      advance: sum("advance"),
      balance: sum("balance"),
      extra: sumM("extraIncome"),
      expenses: sumM("expenses"),
      owner: sumM("partnerCost"),
      profit: sumM("profit"),
    })
  )
  styleHeader(orders)

  const trips = wb.addWorksheet("Cars & routes")
  trips.columns = [
    { header: "Hire date", key: "date", width: 12 },
    { header: "Invoice no.", key: "invNo", width: 18 },
    { header: "Status", key: "status", width: 11 },
    { header: "Customer", key: "customer", width: 22 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Car", key: "car", width: 28 },
    { header: "Amount (LKR)", key: "rate", width: 14, style: { numFmt: MONEY } },
    { header: "Pick-up time", key: "pickupTime", width: 12 },
    { header: "Pick-up location", key: "pickupLoc", width: 30 },
    { header: "Stops", key: "stops", width: 45 },
    { header: "Drop-off time", key: "dropTime", width: 12 },
    { header: "Drop-off location", key: "dropLoc", width: 30 },
  ]
  for (const b of bookings) {
    for (const c of b.cars) {
      const row = trips.addRow({
        date: dmy(b.date),
        invNo: b.invNo,
        status: b.status === "cancelled" ? "Cancelled" : "Confirmed",
        customer: b.customer,
        phone: b.phone,
        car: c.carName,
        rate: c.rate,
        pickupTime: fmtTime(c.pickupTime),
        pickupLoc: c.pickupLoc,
        stops: c.stops.map((s) => (s.time ? `${fmtTime(s.time)} ${s.loc}` : s.loc)).join(" → "),
        dropTime: fmtTime(c.dropTime),
        dropLoc: c.dropLoc,
      })
      if (!isActive(b)) row.font = { color: { argb: "FF999999" }, strike: true }
    }
  }
  styleHeader(trips)

  const money2 = wb.addWorksheet("Income & expenses")
  money2.columns = [
    { header: "Hire no.", key: "invNo", width: 18 },
    { header: "Hire date", key: "hireDate", width: 12 },
    { header: "Customer", key: "customer", width: 22 },
    { header: "Entry date", key: "date", width: 12 },
    { header: "Type", key: "kind", width: 15 },
    { header: "Category", key: "category", width: 18 },
    { header: "Note", key: "note", width: 40 },
    { header: "Amount (LKR)", key: "amount", width: 14, style: { numFmt: MONEY } },
  ]
  for (const b of bookings.filter(isActive)) {
    for (const c of b.cars.filter((c) => c.ownerCost)) {
      money2.addRow({
        invNo: b.invNo,
        hireDate: dmy(b.date),
        customer: b.customer,
        date: dmy(b.date),
        kind: "Owner payment",
        category: "Partner car",
        note: `${c.carName} · ${c.ownerName ?? ""}`,
        amount: -(c.ownerCost ?? 0),
      })
    }
    const entries = ledger
      .filter((e) => e.bookingId === b.id)
      .sort((x, y) => x.date.localeCompare(y.date))
    for (const e of entries) {
      money2.addRow({
        invNo: b.invNo,
        hireDate: dmy(b.date),
        customer: b.customer,
        date: dmy(e.date),
        kind: e.kind === "income" ? "Extra income" : "Expense",
        category: e.category,
        note: e.note,
        // Money out is negative so the column sums to the net.
        amount: e.kind === "income" ? e.amount : -e.amount,
      })
    }
  }
  styleHeader(money2)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `bookings_${from}_to_${to}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return bookings.length
}
