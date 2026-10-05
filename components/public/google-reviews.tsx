"use client"

import * as React from "react"
import { ArrowUpRightIcon, PenLineIcon, StarIcon } from "lucide-react"

import { display } from "@/components/public/fonts"
import { Reveal } from "@/components/public/motion"
import { cn } from "@/lib/utils"

// "Reviews" on the public page: the business's Google rating and latest
// reviews (from /api/public/reviews), with links to read them all and to
// write one. Reviews are shown as Google returns them, with the reviewer's
// name and Google's attribution. Without the Places API set up, only the
// links show.

type Review = { author: string; authorUrl?: string; photo?: string; rating: number; text: string; when: string }
type Data = { profileUrl: string; writeUrl: string; rating?: number; count?: number; reviews: Review[] }

const MUTED = "text-[#6B6259]"
const PILL_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#16120E] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(22,18,14,0.6)] transition hover:-translate-y-0.5 hover:bg-black"
const PILL_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#16120E] shadow-sm transition hover:-translate-y-0.5 hover:border-black/20"

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i))
        return (
          <span key={i} className="relative inline-block size-[1em]">
            <StarIcon className="absolute inset-0 size-full text-[#E4D8C6]" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon className="size-[1em] text-[#E3A33B]" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        )
      })}
    </span>
  )
}

function ReviewCard({ r }: { r: Review }) {
  const [open, setOpen] = React.useState(false)
  const long = r.text.length > 260
  return (
    <article className="flex h-full flex-col gap-4 rounded-3xl border border-black/[0.07] bg-[#F7F4EF] p-6">
      <Stars value={r.rating} className="text-lg" />
      {r.text ? (
        <p className={cn("text-[15px] leading-relaxed whitespace-pre-line", !open && long && "line-clamp-6")}>{r.text}</p>
      ) : (
        <p className={cn("text-sm italic", MUTED)}>Rated {r.rating} stars</p>
      )}
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-fit text-sm font-medium underline-offset-4 hover:underline">
          {open ? "Show less" : "Read more"}
        </button>
      )}
      <footer className="mt-auto flex items-center gap-3 pt-2">
        {r.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the reviewer's Google profile photo
          <img src={r.photo} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 place-items-center rounded-full bg-white text-sm font-semibold">{r.author.slice(0, 1)}</span>
        )}
        <span className="min-w-0">
          {r.authorUrl ? (
            <a href={r.authorUrl} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
              {r.author}
            </a>
          ) : (
            <span className="block truncate font-medium">{r.author}</span>
          )}
          <span className={cn("block text-xs", MUTED)}>{r.when}</span>
        </span>
      </footer>
    </article>
  )
}

export function GoogleReviewsSection() {
  const [data, setData] = React.useState<Data | null>(null)
  React.useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/public/reviews", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => d && setData(d))
      .catch(() => {})
    return () => ctrl.abort()
  }, [])
  if (!data) return null

  const has = data.reviews.length > 0
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
      <div className="mx-auto max-w-[88rem] rounded-[2rem] border border-black/[0.06] bg-white px-6 py-14 sm:px-12 sm:py-20">
        <div className="grid gap-10 *:min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <Reveal>
            <h2 id="reviews-title" className={cn("mb-4 text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>
              Customer reviews on Google
            </h2>
            <p className={cn(display.className, "text-[clamp(2.5rem,11vw,6.5rem)] leading-[0.92] font-medium tracking-[-0.045em]")}>
              Loved on
              <br />
              <span className="text-black/30">their big day.</span>
            </p>
          </Reveal>
          <Reveal delay={100} className="grid gap-5 lg:justify-items-end lg:text-right">
            {data.rating ? (
              <div className="grid gap-1 lg:justify-items-end">
                <div className="flex items-center gap-3">
                  <span className={cn(display.className, "text-6xl font-medium tracking-[-0.04em]")}>{data.rating.toFixed(1)}</span>
                  <Stars value={data.rating} className="text-2xl" />
                </div>
                <p className={cn("text-sm", MUTED)}>
                  {data.count ? `${data.count} review${data.count === 1 ? "" : "s"} on Google` : "on Google"}
                </p>
              </div>
            ) : (
              <p className={cn("max-w-sm text-base leading-relaxed", MUTED)}>
                See what couples say about their wedding cars — and tell others about yours.
              </p>
            )}
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <a href={data.writeUrl} target="_blank" rel="noreferrer" className={PILL_DARK}>
                <PenLineIcon className="size-4" />
                Write a review
              </a>
              <a href={data.profileUrl} target="_blank" rel="noreferrer" className={PILL_LIGHT}>
                {has ? "Read all reviews" : "Read our reviews"} on Google
                <ArrowUpRightIcon className="size-4" />
              </a>
            </div>
          </Reveal>
        </div>

        {has && (
          <>
            <ul className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.reviews.map((r, i) => (
                <Reveal as="li" key={`${r.author}-${i}`} delay={(i % 3) * 80}>
                  <ReviewCard r={r} />
                </Reveal>
              ))}
            </ul>
            <p className={cn("mt-6 text-xs", MUTED)}>Reviews from Google</p>
          </>
        )}
      </div>
    </section>
  )
}
