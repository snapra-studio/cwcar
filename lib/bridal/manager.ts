import { addDays } from "@/lib/bridal/format"

// The Manager role: a restricted admin account (same sign-in as admins) that
// may only list hires in a rolling window, create bookings, and add income /
// expense entries. Shared by the server (guards, data) and the browser
// (navigation), so both apply the same rules. Everything is still checked on
// the server: see lib/server/guard.ts and lib/server/admin-actions.ts.

// Where a manager lands after signing in, and is sent back to from anywhere
// they may not go.
export const MANAGER_HOME = "/admin/dashboard/history"

// The only admin pages a manager may open.
export const MANAGER_PATHS = [
  "/admin/dashboard/history",
  "/admin/dashboard/bookings/new",
  "/admin/dashboard/inquiries",
  "/admin/dashboard/finance",
] as const

// …and editing an inquiry (/admin/dashboard/inquiries/<id>/edit).
const INQUIRY_EDIT = /^\/admin\/dashboard\/inquiries\/[^/]+\/edit$/

export const managerMayOpen = (pathname: string) => (MANAGER_PATHS as readonly string[]).includes(pathname) || INQUIRY_EDIT.test(pathname)

// Hires a manager may see: the previous 7 days and the next 30, both
// including today, counted from today in the business's time zone (so the
// window moves forward every day).
export const MANAGER_PAST_DAYS = 7
export const MANAGER_FUTURE_DAYS = 30

export type DateWindow = { from: string; to: string }

export const managerWindow = (today: string): DateWindow => ({
  from: addDays(today, -MANAGER_PAST_DAYS),
  to: addDays(today, MANAGER_FUTURE_DAYS),
})

export const inWindow = (date: string, w: DateWindow) => date >= w.from && date <= w.to
