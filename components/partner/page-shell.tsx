"use client"

import * as React from "react"

import { FilmNav, wordmark } from "@/components/public/cinematic-film"
import { INK, SiteFooter, type PublicCar } from "@/components/public/site-parts"
import { cn } from "@/lib/utils"

// The public site's frame (top bar, footer, colours) around partner pages.
export function PartnerPageShell({ bizName, cars, today, children }: { bizName: string; cars: PublicCar[]; today: string; children: React.ReactNode }) {
  const name = wordmark(bizName || "Chrish Wedding Cars")
  return (
    <div className={cn("relative min-h-svh overflow-x-clip bg-[#F7F4EF] pt-24 selection:bg-[#E9D7B8]", INK)}>
      <FilmNav bizName={name} />
      <main className="mx-auto grid max-w-[88rem] gap-8 px-4 py-8 sm:px-6">{children}</main>
      <SiteFooter bizName={name} year={today.slice(0, 4)} cars={cars} />
    </div>
  )
}
