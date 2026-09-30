"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Small scroll-motion helpers for the public page. They write transforms
// straight to the element (no React re-render per frame) and do nothing when
// the visitor prefers reduced motion.

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

// Calls `fn(progress)` on scroll, where progress runs from 0 (the element's
// top reaches the bottom of the screen) to 1 (its bottom leaves the top).
export function useScrollProgress<T extends HTMLElement>(fn: (progress: number, el: T) => void) {
  const ref = React.useRef<T>(null)
  const cb = React.useRef(fn)
  React.useEffect(() => {
    cb.current = fn
  })
  React.useEffect(() => {
    const el = ref.current
    if (!el || reduced()) return
    let frame = 0
    const update = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const total = r.height + window.innerHeight
      cb.current(Math.min(1, Math.max(0, (window.innerHeight - r.top) / total)), el)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])
  return ref
}

// Moves its content up/down while scrolling past; `speed` in px across the
// whole pass (negative = up faster than the page).
export function Parallax({
  speed = -80,
  className,
  children,
}: {
  speed?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useScrollProgress<HTMLDivElement>((p, el) => {
    el.style.transform = `translate3d(0, ${((p - 0.5) * speed).toFixed(1)}px, 0)`
  })
  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  )
}

// Fades and lifts its content in the first time it scrolls into view.
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: "div" | "section" | "li" | "p" | "h2"
  delay?: number
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  const ref = React.useRef<HTMLElement>(null)
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag
      ref={ref as React.Ref<never>}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,translate,filter] duration-1000 ease-[cubic-bezier(.2,.7,.2,1)]",
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-10 opacity-0 blur-[6px]",
        // Reduced motion: always visible, no transition.
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-0 motion-reduce:transition-none",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// The four-point sparkle used as the page's mark, with a soft glow.
export function Sparkle({ className, glow = true }: { className?: string; glow?: boolean }) {
  const id = React.useId()
  return (
    <span className={cn("relative inline-block", className)} aria-hidden>
      {glow && (
        <span className="absolute inset-[-60%] animate-[sparkle-glow_6s_ease-in-out_infinite] rounded-full motion-reduce:animate-none bg-[radial-gradient(circle,rgba(214,176,112,0.55)_0%,rgba(233,190,196,0.35)_35%,transparent_70%)] blur-2xl" />
      )}
      <svg viewBox="0 0 100 100" className="relative size-full drop-shadow-[0_10px_30px_rgba(160,120,60,0.35)]">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.55" stopColor="#F4E6CF" />
            <stop offset="1" stopColor="#D2AE72" />
          </linearGradient>
        </defs>
        <path d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z" fill={`url(#${id})`} />
      </svg>
    </span>
  )
}
