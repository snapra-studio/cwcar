import "server-only"

// Today's date (YYYY-MM-DD) in the business's time zone, so "today's hires"
// is right even if the server runs elsewhere. Set APP_TIMEZONE to change it.
export function todayInBusinessTz() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  return `${get("year")}-${get("month")}-${get("day")}`
}
