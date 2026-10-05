import "server-only"

// Simple in-memory brake on guessing (passwords, authenticator codes): after
// too many failures for a key, that key is locked for 10 minutes (per server
// process). Keys are e.g. "driver:<email>", "admin:<email>" (8 tries) and
// "ip:<address>" (30 tries, as several people can share an address).
// Empty keys (unknown IP) are ignored so strangers never share one lock.
const failures = new Map<string, { count: number; until: number }>()
const limit = (key: string) => (key.startsWith("ip:") ? 30 : 8)
const LOCK_MS = 10 * 60 * 1000

export function isLocked(...keys: string[]) {
  return keys.some((k) => {
    const f = k ? failures.get(k) : undefined
    return !!f && f.count >= limit(k) && f.until > Date.now()
  })
}

export function recordFailure(...keys: string[]) {
  for (const k of keys) {
    if (!k) continue
    const f = failures.get(k)
    const count = f && f.until > Date.now() ? f.count + 1 : 1
    failures.set(k, { count, until: Date.now() + LOCK_MS })
  }
}

export function clearFailures(...keys: string[]) {
  for (const k of keys) failures.delete(k)
}

// A slow, uniform answer to failed attempts.
export const pause = () => new Promise((r) => setTimeout(r, 500))
