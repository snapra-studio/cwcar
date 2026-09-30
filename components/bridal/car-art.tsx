import Image from "next/image"

import { cn } from "@/lib/utils"
import type { Car, CarStyle } from "@/lib/bridal/types"

function shade(hex: string, amt: number) {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const n = parseInt(h, 16)
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)))
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")
}

function Wheel({ cx, cy, r, white }: { cx: number; cy: number; r: number; white?: boolean }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="#1B1B22" />
      {white && <circle cx={cx} cy={cy} r={r * 0.62} fill="#F4F4F4" />}
      <circle cx={cx} cy={cy} r={r * 0.42} fill="#A9AEB5" />
      <circle cx={cx} cy={cy} r={r * 0.15} fill="#6B7078" />
    </>
  )
}

function Ribbon({ d, cx, cy }: { d: string; cx: number; cy: number }) {
  return (
    <>
      <path d={d} stroke="#fff" strokeWidth={2.5} opacity={0.9} />
      <circle cx={cx} cy={cy} r={4.5} fill="#fff" />
      <path d={`M${cx} ${cy} l-7 -4 v8z M${cx} ${cy} l7 -4 v8z`} fill="#fff" />
    </>
  )
}

const glass = "fill-muted-foreground/35"

export function CarArt({
  hex = "#888888",
  style = "sedan",
  className,
}: {
  hex?: string
  style?: CarStyle
  className?: string
}) {
  const dk = shade(hex, -0.3)
  const lt = shade(hex, 0.35)

  return (
    <svg viewBox="0 0 244 106" className={cn("w-full", className)} aria-hidden="true">
      <ellipse cx={122} cy={98} rx={108} ry={5} fill="#000" opacity={0.12} />
      {style === "vintage" ? (
        <>
          <path d="M40 50 Q42 46 50 45 L72 44 L84 20 Q86 16 92 16 L150 16 Q156 16 158 21 L168 44 L200 45 Q214 47 216 58 L216 76 L30 76 L30 58 Q30 51 40 50Z" fill={hex} />
          <path d="M18 78 Q22 52 58 52 Q84 52 90 78Z" fill={dk} />
          <path d="M160 78 Q166 52 192 52 Q224 52 230 78Z" fill={dk} />
          <rect x={84} y={72} width={80} height={6} rx={2} fill={dk} />
          <rect x={214} y={48} width={6} height={22} rx={2} fill="#D6D6D6" />
          <circle cx={210} cy={50} r={4} fill="#FFF6C8" />
          <path d="M90 22 L116 22 L116 42 L81 42Z" className={glass} />
          <path d="M122 22 L150 22 L160 42 L122 42Z" className={glass} />
          <Ribbon d="M150 17 L214 50" cx={196} cy={41} />
          <Wheel cx={56} cy={80} r={15} white />
          <Wheel cx={194} cy={80} r={15} white />
        </>
      ) : style === "suv" ? (
        <>
          <path d="M12 72 Q12 56 30 54 L56 52 L72 24 Q75 19 84 19 L182 19 Q192 19 197 29 L208 52 L222 56 Q232 58 232 70 L232 80 Q232 86 226 86 L18 86 Q12 86 12 80Z" fill={hex} />
          <path d="M12 76 L232 76 L232 80 Q232 86 226 86 L18 86 Q12 86 12 80Z" fill={dk} />
          <rect x={84} y={14} width={96} height={3} rx={1.5} fill={dk} />
          <ellipse cx={226} cy={62} rx={5} ry={3} fill="#FFF6C8" />
          <rect x={12} y={60} width={5} height={8} rx={1} fill="#E23B3B" />
          <path d="M80 27 L122 27 L122 50 L66 50Z" className={glass} />
          <path d="M128 27 L180 27 Q187 27 191 34 L199 50 L128 50Z" className={glass} />
          <Ribbon d="M170 20 L224 57" cx={206} cy={45} />
          <Wheel cx={62} cy={86} r={17} />
          <Wheel cx={186} cy={86} r={17} />
        </>
      ) : (
        <>
          <path d="M12 72 Q12 58 30 55 L70 50 Q88 30 110 26 L160 26 Q178 28 196 48 L222 54 Q232 57 232 70 L232 80 Q232 84 226 84 L18 84 Q12 84 12 78Z" fill={hex} />
          <path d="M12 74 L232 74 L232 80 Q232 84 226 84 L18 84 Q12 84 12 78Z" fill={dk} />
          <path d="M34 60 L220 60" stroke={lt} strokeWidth={1.5} opacity={0.7} />
          <ellipse cx={226} cy={62} rx={5} ry={3} fill="#FFF6C8" />
          <rect x={12} y={62} width={5} height={7} rx={1} fill="#E23B3B" />
          <path d="M82 50 Q97 34 112 31 L140 31 L140 50Z" className={glass} />
          <path d="M146 31 L160 31 Q174 33 187 50 L146 50Z" className={glass} />
          <Ribbon d="M160 28 L222 56" cx={204} cy={48} />
          <Wheel cx={60} cy={84} r={15} />
          <Wheel cx={188} cy={84} r={15} />
        </>
      )}
    </svg>
  )
}

// Studio-style frame: dark backdrop, soft spotlight from above and a floor fade.
// Shows the car's photo when it has one, otherwise the drawn car.
export function CarPhoto({
  car,
  className,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority,
}: {
  car: Pick<Car, "name" | "hex" | "style" | "image">
  className?: string
  sizes?: string
  priority?: boolean
}) {
  return (
    <div
      className={cn(
        "relative isolate aspect-[16/10] w-full overflow-hidden bg-[radial-gradient(ellipse_70%_60%_at_50%_30%,#8c7159,#3b2b1e_75%)]",
        className
      )}
    >
      {car.image ? (
        <Image
          src={car.image}
          alt={car.name}
          fill
          unoptimized
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-700 ease-out group-hover/photo:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-end justify-center px-[9%] pb-[7%] transition-transform duration-700 ease-out group-hover/photo:scale-105">
          <CarArt hex={car.hex} style={car.style} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/70 to-transparent" />
    </div>
  )
}

export function Swatch({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-3 shrink-0 rounded-full border border-black/20 align-[-1px]", className)}
      style={{ background: hex }}
    />
  )
}
