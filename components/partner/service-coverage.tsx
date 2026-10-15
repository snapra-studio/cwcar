import { InfoIcon, MapPinIcon, RouteIcon } from "lucide-react"

// Where standard partner hire rates apply (shown under the availability
// form on /inquiry).
const LIMITS = [
  { km: 20, cars: "Black Chrysler & Gold Line Chrysler" },
  { km: 30, cars: "All Other Vehicles" },
]

export function ServiceCoverage() {
  return (
    <section
      aria-labelledby="pi-coverage"
      className="grid gap-4 rounded-[1.75rem] border border-black/[0.06] bg-white/70 p-5 shadow-[0_30px_80px_-50px_rgba(60,40,20,0.25)] sm:p-7"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4 lg:border-r lg:border-black/[0.06] lg:pr-6">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground sm:size-14">
              <MapPinIcon className="size-6 sm:size-7" aria-hidden />
            </span>
            <div className="grid gap-1">
              <h2 id="pi-coverage" className="text-xl font-semibold tracking-tight sm:text-2xl">
                Service Coverage &amp; Distance Limits
              </h2>
              <p className="text-sm text-[#6B6259] sm:text-base">Our standard direct hire rates are applicable within the following areas.</p>
            </div>
          </div>
          <div className="grid gap-2 rounded-2xl bg-[#f6eee4] p-4 sm:p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary">
              <MapPinIcon className="size-4" aria-hidden />
              Applicable Areas
            </h3>
            <p className="text-sm leading-relaxed sm:text-base">
              Ja-Ela, Gampaha, Wattala, Negombo, Divulapitiya, Minuwangoda, Kadawatha, Kiribathgoda, Kelaniya, Nittambuwa and
              selected areas of Colombo (Kollupitiya, Pettah, Bambalapitiya and Dehiwala).
            </p>
          </div>
        </div>

        {LIMITS.map((l) => (
          <div key={l.km} className="grid content-center justify-items-center gap-3 rounded-2xl bg-[#f6eee4] p-5 text-center">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full border border-dashed border-primary/60 text-primary sm:size-16">
                <RouteIcon className="size-6 sm:size-7" aria-hidden />
              </span>
              <span className="text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{l.km} km</span>
            </div>
            <p className="font-semibold">{l.cars}</p>
            <span className="h-px w-10 bg-primary/40" aria-hidden />
            <p className="text-sm text-[#6B6259]">
              Standard hire rates apply for trips within <strong className="whitespace-nowrap text-primary">{l.km} km</strong>.
            </p>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-3 rounded-2xl bg-[#f6eee4]/70 p-4 text-sm leading-relaxed text-[#4d453d]">
        <InfoIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        Standard hire rates apply within the above areas and distance limits. Additional distance charges may apply for locations or
        distances exceeding these limits, subject to confirmation by Chrish Rentals.
      </p>
    </section>
  )
}
