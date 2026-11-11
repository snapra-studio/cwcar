"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, MaximizeIcon, MinimizeIcon } from "lucide-react"
import type { PDFDocumentProxy } from "pdfjs-dist"

import { cn } from "@/lib/utils"

// The brochure PDF as a flip-book: two-page spreads on wider screens (the
// cover on its own, like a printed book), one page at a time on phones.
// Pages are drawn with PDF.js in the browser, a few ahead of where the
// reader is, and turn with a 3D page flip. Arrows, keyboard, swipe, or a
// tap on either half of the book turn the page.

const FLIP_MS = 750
// Pages drawn this many views either side of the open one.
const AHEAD = 2

type View = (number | null)[]
type Flip = { dir: 1 | -1; to: number; run: boolean }

function useWide() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 768px)")
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true
  )
}

// Views of an n-page book: [ [null,1], [2,3], [4,5], … ] or [ [1], [2], … ].
function viewsOf(n: number, wide: boolean): View[] {
  if (!wide) return Array.from({ length: n }, (_, i) => [i + 1])
  const out: View[] = [[null, 1]]
  for (let p = 2; p <= n; p += 2) out.push([p, p + 1 <= n ? p + 1 : null])
  return out
}
const viewIndexOf = (page: number, wide: boolean) => (wide ? Math.floor(page / 2) : page - 1)

type Side = "left" | "right" | "single"

// One page of the book (a drawn image, or a spinner while it draws).
function Face({ p, side, src, title }: { p: number | null | undefined; side: Side; src?: string; title: string }) {
  if (p == null) return null
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden bg-white",
        side === "left" && "rounded-l-md",
        side === "right" && "rounded-r-md",
        side === "single" && "rounded-md"
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- drawn in the browser from the PDF
        <img src={src} alt={`${title} — page ${p}`} draggable={false} className="size-full select-none object-contain" />
      ) : (
        <div className="grid size-full place-items-center text-[#B9AFA4]">
          <Loader2Icon className="size-6 animate-spin" aria-hidden />
        </div>
      )}
      {/* Soft shadow along the spine */}
      {side !== "single" && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 w-10",
            side === "left" ? "right-0 bg-gradient-to-l from-black/15 to-transparent" : "left-0 bg-gradient-to-r from-black/15 to-transparent"
          )}
        />
      )}
    </div>
  )
}

export function BrochureFlipbook({ url, title }: { url: string; title: string }) {
  const wide = useWide()
  const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null)
  const [ratio, setRatio] = React.useState(1.414) // page height ÷ width
  const [images, setImages] = React.useState<Record<number, string>>({})
  const [error, setError] = React.useState("")
  // The first page of the open view (1-based); survives phone ⇄ desktop.
  const [page, setPage] = React.useState(1)
  const [flip, setFlip] = React.useState<Flip | null>(null)
  const [full, setFull] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  const drawing = React.useRef(new Set<number>())
  const urls = React.useRef<string[]>([])

  // Load the PDF (again when the URL changes).
  React.useEffect(() => {
    let live = true
    let task: { destroy(): Promise<void> } | null = null
    // Each viewer gets its own PDF.js worker: a shared one is shut down by
    // the previous viewer's clean-up while the next one is starting.
    let thread: Worker | null = null
    let worker: { destroy(): void } | null = null
    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        if (!live) return
        thread = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" })
        const own = pdfjs.PDFWorker.create({ port: thread })
        worker = own
        // Decoders, fonts and colour profiles from public/pdfjs/ (copied
        // from pdfjs-dist by scripts/copy-pdfjs-assets.mjs). Brochure photos
        // are often JPEG 2000, which needs the wasm decoder.
        const loading = pdfjs.getDocument({
          url,
          worker: own,
          wasmUrl: "/pdfjs/wasm/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          iccUrl: "/pdfjs/iccs/",
        })
        task = loading
        const loaded = await loading.promise
        const first = await loaded.getPage(1)
        const vp = first.getViewport({ scale: 1 })
        if (!live) return
        setRatio(vp.height / vp.width)
        setDoc(loaded)
      } catch (err) {
        console.error("Brochure:", err)
        if (live) setError("The brochure couldn't be opened. Please refresh the page and try again.")
      }
    })()
    const made = urls.current
    return () => {
      live = false
      const [t, w, th] = [task, worker, thread]
      void (async () => {
        await t?.destroy().catch(() => {})
        w?.destroy()
        th?.terminate()
      })()
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [url])

  const n = doc?.numPages ?? 0
  const views = React.useMemo(() => viewsOf(n, wide), [n, wide])
  const at = Math.min(viewIndexOf(page, wide), Math.max(0, views.length - 1))
  const target = flip ? viewIndexOf(flip.to, wide) : at

  // Draw the pages around the open view (and the one being turned to).
  React.useEffect(() => {
    if (!doc) return
    const want = new Set<number>()
    for (let i = Math.min(at, target) - AHEAD; i <= Math.max(at, target) + AHEAD; i++) views[i]?.forEach((p) => p && want.add(p))
    const width = Math.min(1400, Math.round((wide ? 760 : 900) * Math.min(window.devicePixelRatio || 1, 2)))
    for (const p of want) {
      if (images[p] || drawing.current.has(p)) continue
      drawing.current.add(p)
      void (async () => {
        try {
          const pg = await doc.getPage(p)
          const base = pg.getViewport({ scale: 1 })
          const viewport = pg.getViewport({ scale: width / base.width })
          const canvas = document.createElement("canvas")
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          await pg.render({ canvas, viewport }).promise
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88))
          if (!blob) return
          const u = URL.createObjectURL(blob)
          urls.current.push(u)
          setImages((m) => ({ ...m, [p]: u }))
        } catch (err) {
          console.error("Brochure page", p, err)
        } finally {
          drawing.current.delete(p)
        }
      })()
    }
  }, [doc, at, target, views, wide, images])

  const go = React.useCallback(
    (dir: 1 | -1) => {
      if (flip || !views.length) return
      const next = at + dir
      if (next < 0 || next >= views.length) return
      const to = views[next].find((p) => p != null)!
      setFlip({ dir, to, run: false })
      // Start the turn on the next frame so the transition runs.
      requestAnimationFrame(() => requestAnimationFrame(() => setFlip((f) => (f ? { ...f, run: true } : f))))
      window.setTimeout(() => {
        setPage(to)
        setFlip(null)
      }, FLIP_MS)
    },
    [flip, views, at]
  )

  // Keyboard: ← → (and PageUp / PageDown).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1)
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go])

  // Full screen.
  React.useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", on)
    return () => document.removeEventListener("fullscreenchange", on)
  }, [])
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())?.catch(() => {})

  // Swipe.
  const startX = React.useRef<number | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current == null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    else {
      // A tap: right half turns forward, left half back.
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      go(e.clientX > r.left + r.width / 2 ? 1 : -1)
    }
  }

  const cur = views[at] ?? []
  const nxt = flip ? (views[target] ?? []) : cur
  const label = (v: View) => {
    const ps = v.filter((p): p is number => p != null)
    return ps.length > 1 ? `Pages ${ps[0]}–${ps[1]} of ${n}` : `Page ${ps[0] ?? 1} of ${n}`
  }

  const face = (p: number | null | undefined, side: Side) => <Face p={p} side={side} src={p == null ? undefined : images[p]} title={title} />

  // What lies flat while a page turns, and the turning leaf's two sides.
  let flatL: number | null | undefined, flatR: number | null | undefined
  let leaf: { front: number | null | undefined; back: number | null | undefined; half: "left" | "right" } | null = null
  if (wide) {
    if (flip?.dir === 1) {
      ;[flatL, flatR] = [cur[0], nxt[1]]
      leaf = { front: cur[1], back: nxt[0], half: "right" }
    } else if (flip?.dir === -1) {
      ;[flatL, flatR] = [nxt[0], cur[1]]
      leaf = { front: cur[0], back: nxt[1], half: "left" }
    } else [flatL, flatR] = [cur[0], cur[1]]
  }

  const book = (
    <div
      className="relative mx-auto touch-pan-y select-none [perspective:2400px]"
      style={{
        aspectRatio: `${wide ? 2 : 1} / ${ratio}`,
        width: `min(100%, calc((${full ? "100svh - 7rem" : "100svh - 13rem"}) * ${wide ? 2 : 1} / ${ratio}))`,
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      role="group"
      aria-roledescription="flip-book"
      aria-label={title}
    >
      {wide ? (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2">
            {face(flatL, "left")}
          </div>
          <div className="absolute inset-y-0 right-0 w-1/2">
            {face(flatR, "right")}
          </div>
          {leaf && (
            <div
              className={cn(
                "absolute inset-y-0 w-1/2 [transform-style:preserve-3d]",
                leaf.half === "right" ? "right-0 origin-left" : "left-0 origin-right"
              )}
              style={{
                transform: `rotateY(${flip?.run ? (leaf.half === "right" ? -180 : 180) : 0}deg)`,
                transition: `transform ${FLIP_MS}ms cubic-bezier(.45,.05,.25,1)`,
              }}
            >
              <div className="absolute inset-0 [backface-visibility:hidden]">
                {face(leaf.front, leaf.half)}
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                {face(leaf.back, leaf.half === "right" ? "left" : "right")}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Phone: the page underneath, and the current page turning away
              (forward) or the previous page turning back in. */}
          {face(flip?.dir === 1 ? nxt[0] : cur[0], "single")}
          {flip && (
            <div
              className="absolute inset-0 origin-left [backface-visibility:hidden]"
              style={{
                transform: `rotateY(${flip.dir === 1 ? (flip.run ? -100 : 0) : flip.run ? 0 : -100}deg)`,
                opacity: flip.dir === 1 ? (flip.run ? 0 : 1) : flip.run ? 1 : 0,
                transition: `transform ${FLIP_MS}ms cubic-bezier(.45,.05,.25,1), opacity ${FLIP_MS}ms ease`,
              }}
            >
              {face(flip.dir === 1 ? cur[0] : nxt[0], "single")}
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div ref={box} className={cn("grid gap-4", full && "h-svh content-center bg-[#2A2420] p-4")}>
      {error ? (
        <p role="alert" className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center text-sm">
          {error}
        </p>
      ) : !doc ? (
        <div className="grid place-items-center gap-3 py-24 text-sm text-[#B9AFA4]">
          <Loader2Icon className="size-8 animate-spin" aria-hidden />
          Opening the brochure…
        </div>
      ) : (
        book
      )}

      <div className="flex flex-wrap items-center justify-center gap-1 text-sm sm:gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!doc || at === 0 || !!flip}
          aria-label="Previous page"
          className="grid size-11 place-items-center rounded-full bg-white/90 text-[#16120E] shadow-sm transition hover:bg-white disabled:opacity-40"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <span aria-live="polite" className="min-w-28 text-center text-[#F6EEE2] tabular-nums sm:min-w-36">
          {doc ? label(flip ? nxt : cur) : ""}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!doc || at >= views.length - 1 || !!flip}
          aria-label="Next page"
          className="grid size-11 place-items-center rounded-full bg-white/90 text-[#16120E] shadow-sm transition hover:bg-white disabled:opacity-40"
        >
          <ChevronRightIcon className="size-5" />
        </button>
        <span className="mx-1 hidden h-6 w-px bg-white/20 sm:block" aria-hidden />
        <button
          type="button"
          onClick={toggleFull}
          aria-label={full ? "Exit full screen" : "Full screen"}
          className="grid size-11 place-items-center rounded-full text-[#F6EEE2] transition hover:bg-white/10"
        >
          {full ? <MinimizeIcon className="size-5" /> : <MaximizeIcon className="size-5" />}
        </button>
      </div>
    </div>
  )
}
