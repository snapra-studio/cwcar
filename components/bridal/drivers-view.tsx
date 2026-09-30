"use client"

import * as React from "react"
import { KeyRoundIcon, PencilIcon, PlusIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, todayIso } from "@/lib/bridal/format"
import { createDriver, isActive, setDriverPassword, updateDriver, useBridal } from "@/lib/bridal/store"
import type { Driver, DriverStatus } from "@/lib/bridal/types"

export function DriversView() {
  const { ready, drivers, bookings } = useBridal()
  if (!ready) return <Skeleton className="h-72 rounded-xl" />

  const today = todayIso()
  // Upcoming cars each driver is assigned to, for a quick workload view.
  const upcoming = (id: string) =>
    bookings
      .filter((b) => isActive(b) && b.date >= today)
      .flatMap((b) => b.cars.filter((c) => c.driverId === id).map(() => b.date))
      .sort()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Drivers</CardTitle>
        <CardDescription>
          Drivers sign in at <span className="font-medium text-foreground">/driver/login</span> and only see the hires
          you assign to them.
        </CardDescription>
        <CardAction>
          <DriverDialog mode="add" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {drivers.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserRoundIcon />
              </EmptyMedia>
              <EmptyTitle>No drivers yet</EmptyTitle>
              <EmptyDescription>Add a driver, then pick them for each car on a booking.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <DriverDialog mode="add" />
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="grid gap-2">
            {drivers.map((d) => {
              const dates = upcoming(d.id)
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/60 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary">
                    {d.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="grid min-w-48 flex-1 gap-0.5">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {d.name}
                      <Badge variant={d.status === "active" ? "secondary" : "destructive"}>
                        {d.status === "active" ? "Active" : "Switched off"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {d.email}
                      {d.phone && ` · ${d.phone}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {dates.length
                        ? `${dates.length} upcoming car${dates.length === 1 ? "" : "s"} · next ${fmtDate(dates[0])}`
                        : "No upcoming hires"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <DriverDialog mode="edit" driver={d} />
                    <PasswordDialog driver={d} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DriverDialog({ mode, driver }: { mode: "add" | "edit"; driver?: Driver }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "add" ? (
          <Button className="rounded-full">
            <PlusIcon data-icon="inline-start" />
            Add driver
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="rounded-full">
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a driver" : `Edit ${driver?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "They sign in with this email and password."
              : "Switching a driver off signs them out and blocks their login."}
          </DialogDescription>
        </DialogHeader>
        <DriverForm driver={driver} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DriverForm({ driver, onDone }: { driver?: Driver; onDone: () => void }) {
  const [form, setForm] = React.useState({
    name: driver?.name ?? "",
    email: driver?.email ?? "",
    phone: driver?.phone ?? "",
    status: (driver?.status ?? "active") as DriverStatus,
    password: "",
  })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (driver) {
        await updateDriver(driver.id, { name: form.name, email: form.email, phone: form.phone, status: form.status })
        toast.success("Driver updated")
      } else {
        await createDriver({ name: form.name, email: form.email, phone: form.phone, password: form.password })
        toast.success(`${form.name} added`)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const pid = driver?.id ?? "new"
  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${pid}-name`}>Name</FieldLabel>
          <Input id={`${pid}-name`} value={form.name} onChange={set("name")} autoComplete="off" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${pid}-email`}>Email (username)</FieldLabel>
          <Input id={`${pid}-email`} type="email" value={form.email} onChange={set("email")} autoComplete="off" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${pid}-phone`}>Phone</FieldLabel>
          <Input id={`${pid}-phone`} type="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        {driver ? (
          <Field>
            <FieldLabel htmlFor={`${pid}-status`}>Status</FieldLabel>
            <NativeSelect id={`${pid}-status`} className="w-full" value={form.status} onChange={set("status")}>
              <NativeSelectOption value="active">Active — can sign in</NativeSelectOption>
              <NativeSelectOption value="inactive">Switched off — can&apos;t sign in</NativeSelectOption>
            </NativeSelect>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${pid}-password`}>Password</FieldLabel>
            <Input
              id={`${pid}-password`}
              type="password"
              value={form.password}
              onChange={set("password")}
              autoComplete="new-password"
            />
            <FieldDescription>At least 8 characters. Give it to the driver privately.</FieldDescription>
          </Field>
        )}
        {error && <FieldError>{error}</FieldError>}
        <Button type="submit" className="rounded-full" disabled={busy}>
          {busy ? "Saving…" : driver ? "Save changes" : "Add driver"}
        </Button>
      </FieldGroup>
    </form>
  )
}

function PasswordDialog({ driver }: { driver: Driver }) {
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await setDriverPassword(driver.id, password)
      toast.success(`Password changed for ${driver.name}`)
      setPassword("")
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <KeyRoundIcon data-icon="inline-start" />
          Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New password for {driver.name}</DialogTitle>
          <DialogDescription>The old password stops working straight away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${driver.id}-newpw`}>New password</FieldLabel>
              <Input
                id={`${driver.id}-newpw`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <FieldDescription>At least 8 characters.</FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" className="rounded-full" disabled={busy}>
              {busy ? "Saving…" : "Change password"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
