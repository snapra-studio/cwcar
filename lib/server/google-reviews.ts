import "server-only"

import { q } from "@/lib/server/db"

// Google reviews of the business, for the public page, through the official
// Places API (New).
//
// Ownership (docs/architecture/ssot.md §11): Google owns the reviews and the
// rating (EXTERNAL SOURCE). We keep a short-lived copy (kv 'google_reviews',
// refreshed every 12 hours) so the page doesn't call Google on every visit,
// and always show them with the reviewer's name and Google's attribution.
// Without an API key the page still links to the profile.
//
// Setup (.env.local, never committed):
//   GOOGLE_PLACES_API_KEY  an API key with "Places API (New)" enabled
//   GOOGLE_PLACE_ID        optional; found by searching the business name once
//   GOOGLE_REVIEWS_URL     optional; the profile link (default: the share link)

export type GoogleReview = {
  author: string
  authorUrl?: string
  photo?: string
  rating: number
  text: string
  when: string
  publishTime?: string
}

export type GoogleReviews = {
  // Links work with or without the API.
  profileUrl: string
  writeUrl: string
  rating?: number
  count?: number
  reviews: GoogleReview[]
  fetchedAt?: string
}

const SHARE_URL = "https://share.google/ZC207eOboJswnhfGw"
const SEARCH_TEXT = "Chrish Wedding Cars & Rentals, Ja-Ela, Sri Lanka"
const REFRESH_MS = 12 * 60 * 60 * 1000
// Tests point this at a local stand-in for places.googleapis.com.
const base = () => process.env.GOOGLE_PLACES_BASE || "https://places.googleapis.com"
const key = () => process.env.GOOGLE_PLACES_API_KEY ?? ""
const profileUrl = () => process.env.GOOGLE_REVIEWS_URL || SHARE_URL

type Cached = Omit<GoogleReviews, "profileUrl" | "writeUrl"> & { placeId?: string; mapsUrl?: string; writeUrl?: string; error?: string; attemptAt?: string }

async function readCache(): Promise<Cached> {
  const [row] = await q("SELECT value FROM kv WHERE key = 'google_reviews'")
  return row ? JSON.parse(String(row.value)) : { reviews: [] }
}

async function writeCache(value: Cached) {
  await q(
    `INSERT INTO kv (key, value) VALUES ('google_reviews', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(value)]
  )
}

// What the public page shows now (cached; never waits for Google).
export async function getGoogleReviews(): Promise<GoogleReviews> {
  const c = key() ? await readCache() : { reviews: [] as GoogleReview[] }
  const placeId = "placeId" in c ? c.placeId : undefined
  return {
    profileUrl: ("mapsUrl" in c && c.mapsUrl) || profileUrl(),
    writeUrl:
      ("writeUrl" in c && c.writeUrl) ||
      (placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : profileUrl()),
    rating: c.rating,
    count: c.count,
    reviews: c.reviews ?? [],
    fetchedAt: c.fetchedAt,
  }
}

async function places<T>(path: string, init: RequestInit & { fieldMask: string }): Promise<T> {
  const res = await fetch(`${base()}/v1/${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": init.fieldMask },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Google said: ${body.error?.message ?? `HTTP ${res.status}`}`)
  return body as T
}

type Place = {
  id?: string
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  googleMapsLinks?: { writeAReviewUri?: string; reviewsUri?: string }
  reviews?: {
    rating?: number
    text?: { text?: string }
    originalText?: { text?: string }
    relativePublishTimeDescription?: string
    publishTime?: string
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
  }[]
}

const safeUrl = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined)

// Fetches fresh reviews from Google if the copy is older than 12 hours.
export async function refreshGoogleReviewsIfDue() {
  if (!key()) return
  const c = await readCache()
  const last = Date.parse(c.attemptAt ?? c.fetchedAt ?? "")
  if (last && Date.now() - last < REFRESH_MS) return
  const attemptAt = new Date().toISOString()
  // Two page loads at once must not both call Google: a 2-minute lease.
  const lease = await q(
    `INSERT INTO kv (key, value) VALUES ('google_reviews_lease', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE kv.value < $2
     RETURNING 1`,
    [new Date(Date.now() + 2 * 60 * 1000).toISOString(), attemptAt]
  )
  if (!lease.length) return
  await writeCache({ ...c, attemptAt })
  try {
    let placeId = process.env.GOOGLE_PLACE_ID || c.placeId
    if (!placeId) {
      const found = await places<{ places?: { id: string }[] }>("places:searchText", {
        method: "POST",
        body: JSON.stringify({ textQuery: SEARCH_TEXT, maxResultCount: 1 }),
        fieldMask: "places.id",
      })
      placeId = found.places?.[0]?.id
      if (!placeId) throw new Error("Google couldn't find the business. Set GOOGLE_PLACE_ID.")
    }
    const p = await places<Place>(`places/${encodeURIComponent(placeId)}`, {
      method: "GET",
      fieldMask: "id,rating,userRatingCount,reviews,googleMapsUri,googleMapsLinks",
    })
    await writeCache({
      placeId,
      rating: p.rating,
      count: p.userRatingCount,
      mapsUrl: safeUrl(p.googleMapsLinks?.reviewsUri) ?? safeUrl(p.googleMapsUri),
      writeUrl: safeUrl(p.googleMapsLinks?.writeAReviewUri),
      reviews: (p.reviews ?? []).map((r) => ({
        author: r.authorAttribution?.displayName ?? "Google user",
        authorUrl: safeUrl(r.authorAttribution?.uri),
        photo: safeUrl(r.authorAttribution?.photoUri),
        rating: Math.max(0, Math.min(5, Math.round(r.rating ?? 0))),
        text: (r.text?.text ?? r.originalText?.text ?? "").slice(0, 2000),
        when: r.relativePublishTimeDescription ?? "",
        publishTime: r.publishTime,
      })),
      fetchedAt: attemptAt,
      attemptAt,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : "Couldn't reach Google."
    console.error("Google reviews:", error)
    await writeCache({ ...c, attemptAt, error })
  }
}
