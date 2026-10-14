import type { Metadata } from "next"
import { connection } from "next/server"

import { InquiryWorkspace } from "@/components/partner/inquiry-workspace"
import { PartnerPageShell } from "@/components/partner/page-shell"
import { ServiceCoverage } from "@/components/partner/service-coverage"
import { getPublicSite } from "@/lib/server/public-site"
import { todayInBusinessTz } from "@/lib/server/today"

// Hire partner (B2B) inquiry page: other hire companies check our fleet for a
// date and time and send an inquiry. Kept out of search results — it's for
// trade partners, not wedding customers.
export const metadata: Metadata = {
  title: { absolute: "Chrish Rentals – Hire Partner Inquiry" },
  description: "For hire companies and agents: check Chrish Rentals' wedding car fleet for your date and time, get an estimated quotation and send a hire inquiry.",
  robots: { index: false, follow: false },
}

export default async function InquiryPage() {
  await connection()
  const site = await getPublicSite()
  return (
    <PartnerPageShell bizName={site.business.name} cars={site.cars} today={todayInBusinessTz()}>
      <header className="grid gap-3">
        <p className="text-xs font-medium tracking-[0.3em] text-[#6B6259] uppercase">For hire companies &amp; agents</p>
        <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1] font-medium tracking-[-0.035em]">Hire Partner Inquiry</h1>
        <p className="max-w-2xl text-base leading-relaxed text-[#6B6259]">
          Choose the hire date and times to see which of our cars are available, then send an inquiry with an estimated quotation,
          including your partner commission. Nothing is booked until Chrish Rentals approves it — you&apos;ll get the decision by
          email.
        </p>
      </header>
      <InquiryWorkspace today={todayInBusinessTz()} afterForm={<ServiceCoverage />} />
    </PartnerPageShell>
  )
}
