"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { STYLE_LABEL, carAlt, carPath, type PublicCar } from "@/components/public/site-parts"
import { cn } from "@/lib/utils"

// "Spotlight" fleet carousel: the car photos sit side by side in a rail,
// overlapping like shingles, with the one in the middle brought forward at
// full size. Every card has the photos' own 16:10 shape, so the whole car is
// always in view (nothing is cropped off), and the caption sits below the
// rail instead of over the car. Neighbours step down in size and brightness
// the further they are from the middle. Arrows, dots, swipe, keyboard, or
// clicking a side card move it; it also advances slowly on its own until
// someone interacts with it.

const VISIBLE = 2 // cards shown on each side of the middle one
const AUTOPLAY_MS = 6000
const RATIO = 10 / 16 // photo height / width (the shape car photos are saved in)
const SCALE = [1, 0.72, 0.52]

// Card size for a given distance from the middle, for a rail `w` px wide.
function sizeAt(dist: number, w: number) {
  // Phones: the middle car nearly fills the width; wider screens: about half.
  const base = w < 640 ? w * 0.8 : Math.min(760, Math.max(320, w * 0.5))
  const s = SCALE[Math.min(dist, SCALE.length - 1)]
  return { w: base * s, h: base * s * RATIO }
}

export function FleetSpotlight({ cars, onPick }: { cars: PublicCar[]; onPick: (id: string) => void }) {
  const n = cars.length
  const [active, setActive] = React.useState(0)
  const [railW, setRailW] = React.useState(1100)
  const [paused, setPaused] = React.useState(false)
  const railRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ x: number; moved: boolean } | null>(null)

  const go = React.useCallback((i: number) => setActive(((i % n) + n) % n), [n])

  React.useEffect(() => {
    const el = railRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setRailW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Gentle autoplay; stops for good once someone interacts, and never runs
  // for visitors who prefer less motion.
  React.useEffect(() => {
    if (paused || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = setInterval(() => setActive((a) => (a + 1) % n), AUTOPLAY_MS)
    return () => clearInterval(t)
  }, [paused, n])

  if (!n) return null

  // Signed distance from the middle, wrapping around so the rail loops.
  const offset = (i: number) => {
    let d = i - active
    if (d > n / 2) d -= n
    if (d < -n / 2) d += n
    return d
  }
  // Centre position of each card. Neighbours tuck about a fifth of their
  // width behind the card in front, so most of each car stays visible.
  const centre = (d: number) => {
    let x = 0
    for (let k = 1; k <= Math.abs(d); k++) x += ((sizeAt(k - 1, railW).w + sizeAt(k, railW).w) / 2) * 0.8
    return Math.sign(d) * x
  }
  const railH = sizeAt(0, railW).h + 32
  const interact = () => setPaused(true)
  const car = cars[active]

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Our wedding cars"
      className="grid gap-6"
      onPointerEnter={interact}
      onFocusCapture={interact}
    >
      <div
        ref={railRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(active + 1)
          else if (e.key === "ArrowLeft") go(active - 1)
          else return
          e.preventDefault()
          interact()
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.moved || Math.abs(e.clientX - d.x) < 40) return
          d.moved = true
          interact()
          go(active + (e.clientX < d.x ? 1 : -1))
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        // Photos would otherwise start the browser's own image drag and swallow the swipe.
        onDragStart={(e) => e.preventDefault()}
        className="relative touch-pan-y overflow-hidden rounded-[2rem] outline-none select-none focus-visible:ring-3 focus-visible:ring-black/20"
        style={{ height: railH }}
      >
        {cars.map((c, i) => {
          const d = offset(i)
          const dist = Math.abs(d)
          const hidden = dist > VISIBLE
          const { w, h } = sizeAt(Math.min(dist, VISIBLE + 1), railW)
          const on = d === 0
          return (
            <div
              key={c.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}: ${c.color} ${c.name}`}
              aria-hidden={hidden || undefined}
              onClick={() => {
                if (drag.current?.moved) return
                if (!on) {
                  interact()
                  go(i)
                }
              }}
              className={cn(
                "absolute top-1/2 left-1/2 overflow-hidden rounded-[1.4rem] bg-[#2a211a] shadow-[0_30px_60px_-30px_rgba(40,30,20,0.55)] transition-[width,height,transform,filter,opacity] duration-700 ease-[cubic-bezier(.2,.75,.2,1)] motion-reduce:transition-none",
                on ? "ring-1 ring-white/50" : "cursor-pointer",
                hidden && "pointer-events-none"
              )}
              style={{
                width: w,
                height: h,
                zIndex: 20 - dist,
                transform: `translate(calc(-50% + ${centre(d)}px), -50%)`,
                filter: on ? "none" : `brightness(${1 - dist * 0.16}) saturate(${1 - dist * 0.15})`,
                opacity: hidden ? 0 : 1,
              }}
            >
              <CarPhoto car={c} alt={carAlt(c)} shade={false} className="aspect-auto size-full" sizes="(min-width: 1024px) 760px, 80vw" />
              <span aria-hidden className="pointer-events-none absolute top-3 left-4 text-xs font-medium tracking-wide text-white/90 drop-shadow">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
          )
        })}
      </div>

      {/* Caption for the car in the middle, under the photos. */}
      {car && (
        <div key={car.id} className="mx-auto grid max-w-xl animate-in justify-items-center gap-3 text-center duration-500 fade-in slide-in-from-bottom-2">
          <div>
            <p className="text-[11px] font-medium tracking-[0.25em] text-[#6B6259] uppercase">
              {String(active + 1).padStart(2, "0")} · {STYLE_LABEL[car.style]}
            </p>
            <h3 className="mt-1 text-2xl leading-tight font-medium sm:text-3xl">{car.name}</h3>
            <p className="text-sm text-[#6B6259] capitalize">{car.color}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                interact()
                onPick(car.id)
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#16120E] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black"
            >
              Check dates
              <ArrowRightIcon className="size-4" aria-hidden />
            </button>
            <Link
              href={carPath(car)}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-5 py-2.5 text-sm font-medium transition hover:border-black/30"
            >
              View car
              <ArrowUpRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous car"
          onClick={() => {
            interact()
            go(active - 1)
          }}
          className="grid size-11 place-items-center rounded-full border border-black/10 bg-white transition hover:bg-[#16120E] hover:text-white"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <div className="flex items-center gap-1.5" role="group" aria-label="Choose a car">
          {cars.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Show ${c.color} ${c.name}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => {
                interact()
                go(i)
              }}
              className={cn("h-1.5 rounded-full transition-all duration-500", i === active ? "w-7 bg-[#16120E]" : "w-1.5 bg-black/20 hover:bg-black/40")}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next car"
          onClick={() => {
            interact()
            go(active + 1)
          }}
          className="grid size-11 place-items-center rounded-full border border-black/10 bg-white transition hover:bg-[#16120E] hover:text-white"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {car ? `Showing ${car.color} ${car.name}` : ""}
      </p>
    </div>
  )
}
