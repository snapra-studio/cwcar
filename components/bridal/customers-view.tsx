"use client"

import * as React from "react"
import Link from "next/link"
import { SearchIcon, UsersIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, rs, todayIso } from "@/lib/bridal/format"
import { isActive, useBridal } from "@/lib/bridal/store"
import type { Booking } from "@/lib/bridal/types"

// Customers aren't stored separately: each booking carries the customer's
// name, phone and address. This groups bookings by phone number (digits only)
// so the admin can see everyone they've hired to. Details are edited on the
// booking itself.
type Customer = { key: string; name: string; phone: string; address: string; hires: Booking[] }

function groupCustomers(bookings: Booking[]): Customer[] {
  const map = new Map<string, Customer>()
  for (const b of bookings.slice().sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    const key = b.phone.replace(/\D/g, "") || b.customer.trim().toLowerCase()
    const c = map.get(key) ?? { key, name: b.customer, phone: b.phone, address: b.address, hires: [] }
    // The most recent booking has the freshest details.
    c.name = b.customer
    c.phone = b.phone
    if (b.address) c.address = b.address
    c.hires.push(b)
    map.set(key, c)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function CustomersView() {
  const { ready, bookings } = useBridal()
  const [query, setQuery] = React.useState("")
  if (!ready) return <Skeleton className="h-72 rounded-xl" />

  const today = todayIso()
  const q = query.trim().toLowerCase()
  const customers = groupCustomers(bookings).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Customers</CardTitle>
        <CardDescription>Everyone you&apos;ve taken a booking for. Edit a customer&apos;s details from their booking.</CardDescription>
        <CardAction>
          <InputGroup className="w-64 max-w-full">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search customers"
              placeholder="Name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>{q ? "No customer matches" : "No customers yet"}</EmptyTitle>
              <EmptyDescription>Customers appear here once you make a booking.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Hires</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Last / next hire</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const active = c.hires.filter(isActive)
                const next = active.filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
                const last = c.hires.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
                const shown = next ?? last
                return (
                  <TableRow key={c.key}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{c.name}</div>
                      {c.address && <div className="text-xs text-muted-foreground">{c.address}</div>}
                    </TableCell>
                    <TableCell>
                      <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="hover:text-primary">
                        {c.phone}
                      </a>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{active.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{rs(active.reduce((n, b) => n + b.total, 0))}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/dashboard/bookings/${shown.id}/edit`}
                        className="inline-flex flex-wrap items-center gap-1.5 hover:text-primary"
                      >
                        {fmtDate(shown.date)}
                        <span className="font-mono text-xs text-muted-foreground">{shown.invNo}</span>
                        {next && <Badge variant="secondary">Upcoming</Badge>}
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
