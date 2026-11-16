"use client"

import * as React from "react"
import { FileDownIcon, FileSpreadsheetIcon, PrinterIcon } from "lucide-react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/bridal/inquiries-view"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MONTHS, todayIso } from "@/lib/bridal/format"
import { SECTIONS, SUMMARY_ROWS } from "@/lib/bridal/report-export"
import { useBridal } from "@/lib/bridal/store"
import { monthlyReportAction } from "@/lib/server/inquiry-actions"
import type { MonthlyReport } from "@/lib/server/reports"

// Monthly Booking & Inquiry Report: pick a month (or a custom range), read
// the summary and the six lists, export PDF / Excel or print. Admins and
// super admins only (the page and the action both check).

const pad = (n: number) => String(n).padStart(2, "0")
const monthBounds = (y: number, m: number) => [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`] as const

export function ReportsView() {
  const { settings } = useBridal()
  const now = todayIso()
  const [mode, setMode] = React.useState<"month" | "range">("month")
  const [year, setYear] = React.useState(Number(now.slice(0, 4)))
  const [month, setMonth] = React.useState(Number(now.slice(5, 7)) - 1)
  const [range, setRange] = React.useState<[string, string]>(() => [...monthBounds(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1)])
  const [from, to] = mode === "month" ? monthBounds(year, month) : range
  const [report, setReport] = React.useState<{ key: string; data: MonthlyReport } | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState<"" | "pdf" | "xlsx">("")
  const key = `${from}_${to}`

  React.useEffect(() => {
    if (!from || !to) return
    let live = true
    void monthlyReportAction(from, to).then((r) => {
      if (!live) return
      if (r.ok) {
        setReport({ key: `${from}_${to}`, data: r.data })
        setError("")
      } else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [from, to])

  const data = report?.key === key ? report.data : null
  const years = Array.from({ length: 6 }, (_, i) => Number(now.slice(0, 4)) - 4 + i)

  async function exportAs(kind: "pdf" | "xlsx") {
    if (!data) return
    setBusy(kind)
    try {
      const m = await import("@/lib/bridal/report-export")
      await (kind === "pdf" ? m.downloadReportPdf : m.downloadReportExcel)(data, settings.bizName)
      toast.success(kind === "pdf" ? "PDF downloaded" : "Excel downloaded")
    } catch {
      toast.error("Could not create the file. Reload the page and try again.")
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="grid gap-4">
      {/* Printing shows only the report (not the menu or reminders). */}
      <style>{`@media print { header, [data-print-hide] { display: none !important } main { padding: 0 !important } }`}</style>

      <Card data-print-hide>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="repMode">Period</FieldLabel>
            <NativeSelect id="repMode" value={mode} onChange={(e) => setMode(e.target.value as "month" | "range")}>
              <NativeSelectOption value="month">Month</NativeSelectOption>
              <NativeSelectOption value="range">Custom dates</NativeSelectOption>
            </NativeSelect>
          </Field>
          {mode === "month" ? (
            <>
              <Field className="w-auto">
                <FieldLabel htmlFor="repMonth">Month</FieldLabel>
                <NativeSelect id="repMonth" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => (
                    <NativeSelectOption key={m} value={i}>
                      {m}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="w-auto">
                <FieldLabel htmlFor="repYear">Year</FieldLabel>
                <NativeSelect id="repYear" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {years.map((y) => (
                    <NativeSelectOption key={y} value={y}>
                      {y}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </>
          ) : (
            <>
              <Field className="w-auto">
                <FieldLabel htmlFor="repFrom">From</FieldLabel>
                <Input id="repFrom" type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} />
              </Field>
              <Field className="w-auto">
                <FieldLabel htmlFor="repTo">To</FieldLabel>
                <Input id="repTo" type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} />
              </Field>
            </>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportAs("pdf")} disabled={!data || !!busy}>
              <FileDownIcon data-icon="inline-start" />
              {busy === "pdf" ? "Preparing…" : "Export PDF"}
            </Button>
            <Button variant="outline" onClick={() => exportAs("xlsx")} disabled={!data || !!busy}>
              <FileSpreadsheetIcon data-icon="inline-start" />
              {busy === "xlsx" ? "Preparing…" : "Export Excel"}
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <PrinterIcon data-icon="inline-start" />
              Print Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <FieldError>{error}</FieldError>}
      {!data ? (
        !error && <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Summary · {data.from} to {data.to}
              </CardTitle>
              <CardDescription>
                Counted by the date each thing happened (an inquiry made in one month and rejected in the next counts in both). Only
                hires made through inquiries are included. Quoted and booking values are not money received.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                {SUMMARY_ROWS(data.summary).map(([k, v]) => (
                  <div key={k} className="grid gap-1 rounded-xl border bg-card p-3">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {SECTIONS.map((s) => {
            const rows = data[s.key]
            return (
              <Card key={s.key} className="break-inside-avoid-page">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {s.title} <span className="text-muted-foreground">({rows.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None in this period.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {s.cols.map((c) => (
                            <TableHead key={c.head} className={c.right ? "text-right" : undefined}>
                              {c.head}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={`${r.ref}-${i}`}>
                            {s.cols.map((c) => (
                              <TableCell
                                key={c.head}
                                className={c.right ? "text-right tabular-nums" : c.head === "Reference" ? "font-mono text-xs" : "whitespace-normal"}
                              >
                                {c.head === "Status" ? <StatusBadge status={r.status} /> : c.get(r)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}
