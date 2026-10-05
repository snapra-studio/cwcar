"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon, PhoneIcon } from "lucide-react"

import { serif } from "@/components/public/fonts"
import { HeroCheck } from "@/components/public/hero-check"
import type { PublicCar } from "@/components/public/site-parts"
import { cn } from "@/lib/utils"

// The opening of the public page: one full screen of the decorated car
// driving slowly (the uploaded video or newest Facebook reel), with the
// "Find your date" message on the left and the quick availability form
// (hero-check.tsx) on the right; on phones they stack. Without a video, the landing photo
// drifts slowly instead (and a warm gradient if there's no photo either).

const tel = (p: string) => `tel:${p.replace(/\s/g, "")}`

// "Chrish Wedding Cars pvt ltd" -> "Chrish Wedding Cars".
export const wordmark = (name: string) => name.replace(/[\s,]*\(?pvt\)?\.?\s*ltd\.?\s*$/i, "").trim() || name

export function CinematicFilm({
  bizName,
  video,
  phone,
  cars,
  today,
  carId,
  onCarChange,
}: {
  bizName: string
  video?: string
  phone?: string
  cars: PublicCar[]
  today: string
  carId: string
  onCarChange: (id: string) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [photoOk, setPhotoOk] = React.useState(true)
  // Facebook reels are vertical: on a wide screen the reel sits sharp on the
  // right, away from the words, over a blurred copy that fills the screen.
  const [tall, setTall] = React.useState(false)
  // Only wide screens get the blurred copy (so phones download one video).
  const wide = React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(orientation: landscape)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(orientation: landscape)").matches,
    () => false
  )

  // Visitors who prefer less motion see the first frame, not a playing film.
  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) v.pause()
    else void v.play().catch(() => {})
  }, [video])

  return (
    <section id="film" aria-label={`${bizName} — wedding cars`} className="relative min-h-svh overflow-hidden bg-[#1A130D] text-[#F6EEE2]">
      {/* The film (or photo) */}
      <div aria-hidden className="absolute inset-0">
        {video ? (
          <>
            {tall && wide && (
              <video
                key={`${video}-fill`}
                src={video}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
              />
            )}
            <video
              ref={videoRef}
              key={video}
              src={video}
              poster={photoOk && !tall ? "/api/public/hero" : undefined}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => setTall(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
              className={cn(
                "absolute inset-0 size-full scale-[1.03] object-cover",
                tall &&
                  "landscape:inset-auto landscape:top-0 landscape:left-1/2 landscape:h-full landscape:w-auto landscape:max-w-none landscape:-translate-x-1/2 landscape:scale-100 landscape:[mask-image:linear-gradient(90deg,transparent,black_14%,black_86%,transparent)]"
              )}
            />
          </>
        ) : photoOk ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our API, may 404
          <img src="/api/public/hero" alt="" className="size-full animate-kenburns object-cover" onError={() => setPhotoOk(false)} />
        ) : (
          <div className="size-full bg-[radial-gradient(ellipse_at_60%_40%,#5A3F26,#1A130D_70%)]" />
        )}
        {/* Warm dusk grade + shade behind the words on the left. */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,13,8,0.55)_0%,rgba(20,13,8,0.1)_35%,rgba(20,13,8,0.25)_65%,rgba(20,13,8,0.8)_100%)]" />
        <div className="absolute inset-0 bg-[#6B4420]/15 mix-blend-multiply" />
        <div className="absolute inset-y-0 left-0 w-2/3 bg-[linear-gradient(90deg,rgba(20,13,8,0.7),transparent)]" />
      </div>

      <div className="relative mx-auto grid min-h-svh max-w-[88rem] items-center gap-10 px-5 pt-28 pb-16 sm:px-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16 lg:pb-20">
        <div className="grid max-w-xl animate-in gap-5 duration-1000 fade-in slide-in-from-bottom-4">
          <h1 className="text-[11px] font-medium tracking-[0.35em] text-[#E9D2A8] uppercase">Luxury wedding car hire · Ja-Ela, Sri Lanka</h1>
          <p className={cn(serif.className, "text-[clamp(2.6rem,6vw,5.25rem)] leading-[1.02] font-light")}>
            Find your date.
            <br />
            Keep the memory.
          </p>
          <span aria-hidden className="block h-px w-16 bg-[#E9D2A8]/70" />
          <p className="max-w-sm text-sm leading-relaxed text-[#F6EEE2]/80 sm:text-base">
            Choose a car and your date to see if it&apos;s free, then call {wordmark(bizName)} to book it.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="#fleet"
              className="inline-flex items-center gap-2 rounded-full bg-[#E4C48C] px-6 py-3 text-xs font-semibold tracking-[0.2em] text-[#2A1D10] uppercase shadow-[0_10px_30px_-10px_rgba(228,196,140,0.6)] transition hover:bg-[#EDD3A4]"
            >
              See the fleet
              <ArrowRightIcon className="size-4" />
            </a>
            {phone && (
              <a
                href={tel(phone)}
                className="inline-flex items-center gap-2 rounded-full border border-[#F6EEE2]/40 px-6 py-3 text-xs font-semibold tracking-[0.2em] uppercase transition hover:border-[#F6EEE2] hover:bg-white/10"
              >
                <PhoneIcon className="size-4" />
                {phone}
              </a>
            )}
          </div>
        </div>
        <HeroCheck cars={cars} today={today} phone={phone} carId={carId} onCarChange={onCarChange} />
      </div>

      {/* Scroll cue */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-4 hidden flex-col items-center gap-2 text-[10px] tracking-[0.35em] text-[#F6EEE2]/70 uppercase lg:flex"
      >
        Scroll
        <span className="h-10 w-px animate-pulse bg-[#F6EEE2]/50" />
      </div>
    </section>
  )
}

// Top bar: links either side of the logo. See-through over the film; a pale
// frosted bar once the film has scrolled away.
export function FilmNav({ bizName }: { bizName: string }) {
  const [onFilm, setOnFilm] = React.useState(true)
  React.useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const film = document.getElementById("film")
      setOnFilm(!!film && film.getBoundingClientRect().bottom > 96)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])
  const link = cn(
    "hidden text-[11px] font-medium tracking-[0.3em] uppercase transition-colors md:block",
    onFilm ? "text-[#F6EEE2]/80 hover:text-white" : "text-[#4A423B] hover:text-black"
  )
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500",
        onFilm ? "border-b border-transparent bg-gradient-to-b from-black/45 to-transparent" : "border-b border-black/[0.06] bg-[#F7F4EF]/85 backdrop-blur-xl"
      )}
    >
      <nav aria-label="Main" className="mx-auto grid h-24 max-w-[88rem] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/#fleet" className={link}>
            The fleet
          </Link>
          <Link href="/#check" className={link}>
            Availability
          </Link>
        </div>
        <Link href="/" aria-label={`${wordmark(bizName)} — home`} className="block">
          <Image src="/logo.png" alt={`${wordmark(bizName)} logo`} width={160} height={160} priority className="h-20 w-auto drop-shadow-[0_0_14px_rgba(255,236,200,0.35)] sm:h-24" />
        </Link>
        <div className="flex items-center justify-end gap-8">
          <Link href="/#reviews" className={link}>
            Reviews
          </Link>
          <a href="#contact" className={link}>
            Contact
          </a>
        </div>
      </nav>
    </header>
  )
}
