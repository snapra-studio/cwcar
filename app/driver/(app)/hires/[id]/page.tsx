import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, FileTextIcon, FlowerIcon, PhoneIcon, UserRoundIcon } from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { RouteList, StatusBadge } from "@/components/driver/hire-card"
import { Button } from "@/components/ui/button"
import { fmtDate } from "@/lib/bridal/format"
import { hireStatus } from "@/lib/bridal/logic"
import { driverPage } from "@/lib/server/guard"
import { getCarInfo, getDriverHire } from "@/lib/server/repo"
import { todayInBusinessTz } from "@/lib/server/today"

// Full details of one hire. getDriverHire returns nothing unless this driver
// is assigned to it, so another driver's hire id just shows "not found".
export default async function DriverHirePage({ params }: PageProps<"/driver/hires/[id]">) {
  const driver = await driverPage()
  const { id } = await params
  const hire = getDriverHire(driver.id, id)
  if (!hire) notFound()

  const status = hireStatus(hire, todayInBusinessTz())
  const cars = getCarInfo(hire.myCars.map((c) => c.carId))
  const others = hire.cars.length - hire.myCars.length

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/driver/dashboard">
          <ArrowLeftIcon data-icon="inline-start" />
          My hires
        </Link>
      </Button>

      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="font-mono text-sm text-muted-foreground">{hire.invNo}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{fmtDate(hire.date)}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>{hire.type}</span>
          <span className="inline-flex items-center gap-1">
            <FlowerIcon className="size-4" />
            {hire.deco === "fresh" ? "Fresh flowers" : "Artificial flowers"}
          </span>
        </p>
      </div>

      <section className="grid gap-2 rounded-2xl border bg-card p-4">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Customer</h2>
        <div className="flex items-center gap-2 text-lg font-semibold">
          <UserRoundIcon className="size-5 text-primary" />
          {hire.customer}
        </div>
        {hire.phone && (
          <Button asChild size="lg" className="w-full rounded-full sm:w-fit">
            <a href={`tel:${hire.phone.replace(/\s/g, "")}`}>
              <PhoneIcon data-icon="inline-start" />
              Call {hire.phone}
            </a>
          </Button>
        )}
      </section>

      {hire.myCars.map((c, i) => {
        const info = cars[c.carId]
        return (
          <section key={i} className="grid gap-4 overflow-hidden rounded-2xl border bg-card">
            <CarPhoto car={info ?? { name: c.carName, hex: "#999999", style: "sedan" }} sizes="(min-width: 672px) 640px, 100vw" />
            <div className="grid gap-4 px-4 pb-4">
              <div>
                <h2 className="text-xl font-bold">{c.carName}</h2>
                {info?.plate && (
                  <span className="mt-1 inline-block rounded-md border bg-background px-2 py-0.5 font-mono text-sm">
                    {info.plate}
                  </span>
                )}
              </div>
              <RouteList car={c} big />
            </div>
          </section>
        )
      })}

      {others > 0 && (
        <p className="text-sm text-muted-foreground">
          {others} other car{others === 1 ? " is" : "s are"} on this hire with another driver.
        </p>
      )}

      {status !== "cancelled" && (
        <Button asChild size="lg" variant="outline" className="rounded-full">
          <Link href={`/driver/hires/${encodeURIComponent(hire.id)}/invoice`}>
            <FileTextIcon data-icon="inline-start" />
            View invoice
          </Link>
        </Button>
      )}
    </>
  )
}
