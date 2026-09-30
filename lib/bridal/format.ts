export const FRESH_FLOWER_COST = 5000

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export const pad = (n: number) => String(n).padStart(2, "0")

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export const todayIso = () => toIso(new Date())

export const addDays = (s: string, n: number) => {
  const d = parseIso(s)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export const fmtDate = (s: string) =>
  s
    ? parseIso(s).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ""

export const fmtTime = (t: string) => {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`
}

export const rs = (n: number) =>
  "Rs " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 })

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// First and last day of the month `offset` months from `from` (0 = that month).
export const monthRange = (offset = 0, from = new Date()) =>
  [
    toIso(new Date(from.getFullYear(), from.getMonth() + offset, 1)),
    toIso(new Date(from.getFullYear(), from.getMonth() + offset + 1, 0)),
  ] as const
