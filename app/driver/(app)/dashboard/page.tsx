import { CalendarClockIcon, CalendarDaysIcon } from "lucide-react"

import { HireCard } from "@/components/driver/hire-card"
import { hireStatus, startTime } from "@/lib/bridal/logic"
import { driverPage } from "@/lib/server/guard"
import { getCarInfo, getDriverHires } from "@/lib/server/repo"
import { todayInBusinessTz } from "@/lib/server/today"

// Only hires this driver is assigned to (repo filters by driver id).
export default async function DriverDashboard() {
  const driver = await driverPage()
  const today = todayInBusinessTz()
  const hires = (await getDriverHires(driver.id, today)).sort((a, b) =>
    (a.date + startTime(a)).localeCompare(b.date + startTime(b))
  )
  const cars = await getCarInfo([...new Set(hires.flatMap((h) => h.myCars.map((c) => c.carId)))])
  const todays = hires.filter((h) => h.date === today)
  const upcoming = hires.filter((h) => h.date > today)

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">Welcome,</p>
        <h1 className="text-3xl font-bold tracking-tight">{driver.name}</h1>
      </div>

      <section className="grid gap-3" aria-labelledby="today">
        <h2 id="today" className="flex items-center gap-2 text-sm font-bold tracking-widest text-primary uppercase">
          <CalendarClockIcon className="size-4" />
          Today&apos;s hires
        </h2>
        {todays.length ? (
          todays.map((h) => <HireCard key={h.id} hire={h} status={hireStatus(h, today)} cars={cars} />)
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">No hires for you today.</p>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="upcoming">
        <h2 id="upcoming" className="flex items-center gap-2 text-sm font-bold tracking-widest text-primary uppercase">
          <CalendarDaysIcon className="size-4" />
          Upcoming hires
        </h2>
        {upcoming.length ? (
          upcoming.map((h) => <HireCard key={h.id} hire={h} status={hireStatus(h, today)} cars={cars} />)
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
            No upcoming hires assigned to you yet.
          </p>
        )}
      </section>
    </>
  )
}
