"use client"

import * as React from "react"
import {
  CropIcon,
  ExpandIcon,
  FlipHorizontal2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  ShrinkIcon,
  Undo2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

// Crop / fit editor for car photos. The frame has the shape the photo is
// shown in (16:10 on the fleet cards); the admin drags the photo to move it,
// zooms, rotates, straightens, or fits the whole photo with a background
// behind it. "Save" renders exactly what's in the frame to a JPEG data URL.
//
// Position and zoom are kept relative to the frame (pan as a fraction of its
// width/height, zoom as a multiple of "just fills the frame"), so the preview
// and the saved image match at any screen size.

export type PhotoSource = File | string

type Background = "blur" | "white" | "black"
type View = { zoom: number; x: number; y: number; turn: number; tilt: number; flip: boolean; bg: Background }

const START: View = { zoom: 1, x: 0, y: 0, turn: 0, tilt: 0, flip: false, bg: "blur" }
const MIN_ZOOM = 0.2
const MAX_ZOOM = 5

// Width/height of the image once rotated by `deg` degrees.
function rotatedSize(w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { w: w * c + h * s, h: w * s + h * c }
}

// Scale (frame px per image px) at which the rotated photo just covers / just
// fits inside a frame of fw x fh.
function baseScale(img: HTMLImageElement, fw: number, fh: number, deg: number, mode: "cover" | "contain") {
  const r = rotatedSize(img.naturalWidth, img.naturalHeight, deg)
  return mode === "cover" ? Math.max(fw / r.w, fh / r.h) : Math.min(fw / r.w, fh / r.h)
}

// Draws the frame's contents onto a canvas of W x H (used for both the
// background preview and the saved file).
function paint(ctx: CanvasRenderingContext2D, img: HTMLImageElement, v: View, W: number, H: number, photo = true) {
  const deg = v.turn + v.tilt
  ctx.save()
  if (v.bg === "blur") {
    // The photo itself, filling the frame, blurred and dimmed.
    const s = baseScale(img, W, H, 0, "cover") * 1.15
    ctx.filter = `blur(${Math.round(W / 40)}px) brightness(0.75)`
    ctx.drawImage(img, W / 2 - (img.naturalWidth * s) / 2, H / 2 - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s)
    ctx.filter = "none"
  } else {
    ctx.fillStyle = v.bg === "white" ? "#ffffff" : "#000000"
    ctx.fillRect(0, 0, W, H)
  }
  if (!photo) return ctx.restore()
  const s = baseScale(img, W, H, deg, "cover") * v.zoom
  ctx.translate(W / 2 + v.x * W, H / 2 + v.y * H)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.scale(v.flip ? -s : s, s)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  ctx.restore()
}

export function PhotoEditor({
  source,
  onCancel,
  onSave,
  aspect = 16 / 10,
  outputWidth = 1600,
  title = "Edit photo",
}: {
  // null = closed.
  source: PhotoSource | null
  onCancel: () => void
  onSave: (image: string) => void | Promise<void>
  aspect?: number
  outputWidth?: number
  title?: string
}) {
  const [img, setImg] = React.useState<HTMLImageElement | null>(null)
  const [error, setError] = React.useState("")
  const [view, setView] = React.useState<View>(START)
  const [history, setHistory] = React.useState<View[]>([])
  const [dragging, setDragging] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const bgRef = React.useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = React.useState({ w: 0, h: 0 })

  // Load the photo (a newly chosen file, or the saved photo's URL).
  React.useEffect(() => {
    if (!source) return
    let url = ""
    const el = new Image()
    el.decoding = "async"
    el.onload = () => setImg(el)
    el.onerror = () => setError("Couldn't open that photo. Try a JPG or PNG.")
    if (typeof source === "string") el.src = source
    else el.src = url = URL.createObjectURL(source)
    return () => {
      if (url) URL.revokeObjectURL(url)
      setImg(null)
      setError("")
      setView(START)
      setHistory([])
    }
  }, [source])

  // Track the frame's size on screen.
  React.useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setFrame({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [img])

  // Background preview (blur / colour) under the photo.
  React.useEffect(() => {
    const c = bgRef.current
    if (!c || !img || !frame.w) return
    c.width = Math.round(frame.w)
    c.height = Math.round(frame.h)
    const ctx = c.getContext("2d")!
    paint(ctx, img, view, c.width, c.height, false)
  }, [img, frame, view.bg]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every change is undoable.
  const change = (patch: Partial<View> | ((v: View) => Partial<View>), record = true) =>
    setView((v) => {
      const next = { ...v, ...(typeof patch === "function" ? patch(v) : patch) }
      next.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom))
      if (record) setHistory((h) => [...h.slice(-30), v])
      return next
    })
  // Sliders: one undo step per slide (recorded when the slide starts).
  const sliding = React.useRef(false)
  const slide = (patch: Partial<View>) => {
    change(patch, !sliding.current)
    sliding.current = true
  }
  const endSlide = () => {
    sliding.current = false
  }
  const undo = () =>
    setHistory((h) => {
      if (!h.length) return h
      setView(h[h.length - 1])
      return h.slice(0, -1)
    })

  // Zoom that "just fits the whole photo" relative to "just fills the frame".
  const fitZoom = img && frame.w ? baseScale(img, frame.w, frame.h, view.turn + view.tilt, "contain") / baseScale(img, frame.w, frame.h, view.turn + view.tilt, "cover") : 1

  // ---- Pointer: drag to move, pinch to zoom ----
  const pointers = React.useRef(new Map<number, { x: number; y: number }>())
  const gesture = React.useRef<{ dist: number; zoom: number } | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) setHistory((h) => [...h.slice(-30), view])
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom }
    }
    setDragging(true)
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !frame.w) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      change({ zoom: (gesture.current.zoom * dist) / gesture.current.dist }, false)
    } else {
      change((v) => ({ x: v.x + (e.clientX - prev.x) / frame.w, y: v.y + (e.clientY - prev.y) / frame.h }), false)
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    if (!pointers.current.size) setDragging(false)
  }
  function onWheel(e: React.WheelEvent) {
    change((v) => ({ zoom: v.zoom * Math.exp(-e.deltaY * 0.0015) }), false)
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.05 : 0.01
    const keys: Record<string, Partial<View> | ((v: View) => Partial<View>)> = {
      ArrowLeft: (v) => ({ x: v.x - step }),
      ArrowRight: (v) => ({ x: v.x + step }),
      ArrowUp: (v) => ({ y: v.y - step }),
      ArrowDown: (v) => ({ y: v.y + step }),
      "+": (v) => ({ zoom: v.zoom * 1.1 }),
      "=": (v) => ({ zoom: v.zoom * 1.1 }),
      "-": (v) => ({ zoom: v.zoom / 1.1 }),
    }
    const k = keys[e.key]
    if (!k) return
    e.preventDefault()
    change(k)
  }

  async function save() {
    if (!img) return
    setSaving(true)
    try {
      const W = outputWidth
      const H = Math.round(outputWidth / aspect)
      const canvas = document.createElement("canvas")
      canvas.width = W
      canvas.height = H
      paint(canvas.getContext("2d")!, img, view, W, H)
      await onSave(canvas.toDataURL("image/jpeg", 0.86))
    } catch {
      toast.error("Couldn't save the photo. Try a smaller one.")
    } finally {
      setSaving(false)
    }
  }

  // The photo inside the frame, positioned with the same maths as paint().
  const deg = view.turn + view.tilt
  const scale = img && frame.w ? baseScale(img, frame.w, frame.h, deg, "cover") * view.zoom : 0
  const photoStyle: React.CSSProperties | undefined = img
    ? {
        width: img.naturalWidth,
        height: img.naturalHeight,
        transform: `translate(-50%, -50%) translate(${view.x * frame.w}px, ${view.y * frame.h}px) rotate(${deg}deg) scale(${view.flip ? -scale : scale}, ${scale})`,
      }
    : undefined
  const pct = Math.round(view.zoom * 100)

  return (
    <Dialog open={!!source} onOpenChange={(open) => !open && !saving && onCancel()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="size-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Drag to move · scroll or pinch to zoom · arrow keys nudge. Whatever is inside the frame is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div
            ref={frameRef}
            role="application"
            aria-label="Photo frame. Drag to move the photo, use arrow keys to nudge and plus or minus to zoom."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className={cn(
              "relative w-full touch-none overflow-hidden rounded-xl bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
              dragging ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{ aspectRatio: aspect }}
          >
            <canvas ref={bgRef} aria-hidden className="absolute inset-0 size-full" />
            {img && (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo being edited
              <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center" style={photoStyle} />
            )}
            {/* Thirds grid while moving */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 transition-opacity",
                "bg-[linear-gradient(to_right,transparent_calc(33.33%-0.5px),rgba(255,255,255,0.6)_calc(33.33%-0.5px),rgba(255,255,255,0.6)_calc(33.33%+0.5px),transparent_calc(33.33%+0.5px),transparent_calc(66.66%-0.5px),rgba(255,255,255,0.6)_calc(66.66%-0.5px),rgba(255,255,255,0.6)_calc(66.66%+0.5px),transparent_calc(66.66%+0.5px)),linear-gradient(to_bottom,transparent_calc(33.33%-0.5px),rgba(255,255,255,0.6)_calc(33.33%-0.5px),rgba(255,255,255,0.6)_calc(33.33%+0.5px),transparent_calc(33.33%+0.5px),transparent_calc(66.66%-0.5px),rgba(255,255,255,0.6)_calc(66.66%-0.5px),rgba(255,255,255,0.6)_calc(66.66%+0.5px),transparent_calc(66.66%+0.5px))]",
                dragging ? "opacity-100" : "opacity-0"
              )}
            />
            {!img && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{error || "Opening photo…"}</div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <span className="flex items-center justify-between text-sm font-medium">
                Zoom <span className="font-normal text-muted-foreground tabular-nums">{pct}%</span>
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => change((v) => ({ zoom: v.zoom / 1.15 }))}>
                  <ZoomOutIcon />
                </Button>
                <Slider
                  aria-label="Zoom"
                  min={Math.log(MIN_ZOOM)}
                  max={Math.log(MAX_ZOOM)}
                  step={0.01}
                  value={[Math.log(view.zoom)]}
                  onValueChange={([z]) => slide({ zoom: Math.exp(z) })}
                  onValueCommit={endSlide}
                />
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => change((v) => ({ zoom: v.zoom * 1.15 }))}>
                  <ZoomInIcon />
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <span className="flex items-center justify-between text-sm font-medium">
                Straighten <span className="font-normal text-muted-foreground tabular-nums">{view.tilt.toFixed(1)}°</span>
              </span>
              <Slider
                aria-label="Straighten"
                min={-20}
                max={20}
                step={0.5}
                value={[view.tilt]}
                onValueChange={([t]) => slide({ tilt: t })}
                onValueCommit={endSlide}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => change({ zoom: 1, x: 0, y: 0 })}>
              <ExpandIcon data-icon="inline-start" />
              Fill frame
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => change({ zoom: fitZoom, x: 0, y: 0 })}>
              <ShrinkIcon data-icon="inline-start" />
              Fit whole photo
            </Button>
            <Button type="button" size="icon-sm" variant="outline" aria-label="Rotate left" onClick={() => change((v) => ({ turn: (v.turn + 270) % 360 }))}>
              <RotateCcwIcon />
            </Button>
            <Button type="button" size="icon-sm" variant="outline" aria-label="Rotate right" onClick={() => change((v) => ({ turn: (v.turn + 90) % 360 }))}>
              <RotateCwIcon />
            </Button>
            <Button type="button" size="icon-sm" variant="outline" aria-label="Flip" aria-pressed={view.flip} onClick={() => change((v) => ({ flip: !v.flip }))}>
              <FlipHorizontal2Icon />
            </Button>
            <span className="ml-auto flex items-center gap-1 text-sm" role="group" aria-label="Background behind the photo">
              <span className="mr-1 text-muted-foreground">Background</span>
              {(["blur", "white", "black"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={view.bg === b}
                  aria-label={b === "blur" ? "Blurred photo" : b}
                  title={b === "blur" ? "Blurred photo" : b[0].toUpperCase() + b.slice(1)}
                  onClick={() => change({ bg: b })}
                  className={cn(
                    "size-7 rounded-full border-2 transition",
                    view.bg === b ? "border-primary ring-2 ring-primary/30" : "border-border",
                    b === "white" && "bg-white",
                    b === "black" && "bg-black",
                    b === "blur" && "bg-[conic-gradient(from_45deg,#c9b39a,#6b5a48,#e6d8c6,#8c7159,#c9b39a)] blur-[0.5px]"
                  )}
                />
              ))}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={undo} disabled={!history.length}>
              <Undo2Icon data-icon="inline-start" />
              Undo
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => change(START)}
              disabled={JSON.stringify(view) === JSON.stringify(START)}
            >
              Reset
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!img || saving}>
              {saving ? "Saving…" : "Save photo"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
