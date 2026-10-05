import "server-only"

import { headers } from "next/headers"

// The site's address for links in emails: APP_URL in .env.local (e.g.
// https://chrishweddingcars.lk), else the address this request came in on.
export async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

// The visitor's IP as a rate-limit key ("ip:1.2.3.4"), or "" if unknown.
export async function ipKey() {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")
  return ip ? `ip:${ip}` : ""
}
