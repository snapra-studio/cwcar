import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { InquiryWorkspace } from "@/components/partner/inquiry-workspace"
import { PartnerPageShell } from "@/components/partner/page-shell"
import { currentPartner } from "@/lib/server/guard"
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
  const [site, partner] = await Promise.all([getPublicSite(), currentPartner()])
  return (
    <PartnerPageShell bizName={site.business.name} cars={site.cars} today={todayInBusinessTz()}>
      <header className="grid gap-3">
        <p className="text-xs font-medium tracking-[0.3em] text-[#6B6259] uppercase">For hire companies &amp; agents</p>
        <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1] font-medium tracking-[-0.035em]">Hire Partner Inquiry</h1>
        <p className="max-w-2xl text-base leading-relaxed text-[#6B6259]">
          Choose the hire date and times to see which of our cars are available, then send an inquiry with an estimated quotation,
          including your partner commission. Nothing is booked until Chrish Rentals approves it.
        </p>
        <p className="text-sm">
          {partner ? (
            <>
              Signed in as <strong>{partner.company}</strong> ·{" "}
              <Link href="/partner/dashboard" className="font-medium underline underline-offset-4">
                Your partner dashboard
              </Link>
            </>
          ) : (
            <>
              Hire partner?{" "}
              <Link href="/partner/login" className="font-medium underline underline-offset-4">
                Sign in
              </Link>{" "}
              or{" "}
              <Link href="/partner/register" className="font-medium underline underline-offset-4">
                create an account
              </Link>{" "}
              to follow your inquiries and commission.
            </>
          )}
        </p>
      </header>
      <InquiryWorkspace
        today={todayInBusinessTz()}
        prefill={
          partner
            ? { company: partner.company, contactName: partner.contactName, email: partner.email, phone: partner.phone, whatsapp: partner.whatsapp }
            : undefined
        }
      />
    </PartnerPageShell>
  )
}
