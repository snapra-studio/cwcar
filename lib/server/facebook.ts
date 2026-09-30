import "server-only"

import { MAX_VIDEO_BYTES } from "@/lib/bridal/types"
import { q } from "@/lib/server/db"
import { saveFile } from "@/lib/server/files"
import { getSettings, setCoverVideo } from "@/lib/server/repo"

// Keeps the public page's background video in step with the newest reel on
// the business's Facebook page, through the official Graph API.
//
// Ownership (see docs/architecture/ssot.md §11):
//   Facebook owns the reels (EXTERNAL SOURCE). We import the newest one:
//   its video id, permalink and post time, plus a copy of the video file in
//   our storage, so the page never depends on Facebook being reachable.
//   settings.coverVideo (ours) says which file the page plays.
//   kv 'facebook_sync' records the last attempt/success/error (sync status).
//   An uploaded video (settings.coverVideoFrom = "upload") always wins, and
//   removing the video ("none") keeps it off; "Sync now" switches back.
//
// Setup (.env.local, never committed):
//   FB_PAGE_ID     the page's id (61579116013524 for Chrish Wedding Cars & Rentals)
//   FB_PAGE_TOKEN  a long-lived Page access token with pages_read_engagement
//                  and pages_show_list (a Page token made from a long-lived
//                  user token doesn't expire)
//   FB_GRAPH_VERSION  optional, default v25.0

export type FacebookSync = {
  configured: boolean
  lastAttemptAt?: string
  lastSuccessAt?: string
  lastError?: string
  // The reel now playing, if it came from Facebook.
  videoId?: string
  permalink?: string
  postedAt?: string
  description?: string
}

// Tests point this at a local stand-in for graph.facebook.com.
const graphBase = () => process.env.FB_GRAPH_BASE || "https://graph.facebook.com"
const version = () => process.env.FB_GRAPH_VERSION || "v25.0"
const configured = () => !!process.env.FB_PAGE_ID && !!process.env.FB_PAGE_TOKEN

// How often a page visit may trigger a background check.
const CHECK_EVERY_MS = 30 * 60 * 1000

async function readState(): Promise<Omit<FacebookSync, "configured">> {
  const [row] = await q("SELECT value FROM kv WHERE key = 'facebook_sync'")
  return row ? JSON.parse(String(row.value)) : {}
}

async function writeState(patch: Partial<FacebookSync>) {
  await q(
    `INSERT INTO kv (key, value) VALUES ('facebook_sync', $1)
     ON CONFLICT (key) DO UPDATE SET value = (kv.value::jsonb || excluded.value::jsonb)::text`,
    [JSON.stringify(patch)]
  )
}

export async function getFacebookStatus(): Promise<FacebookSync> {
  return { configured: configured(), ...(await readState()) }
}

class GraphError extends Error {}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${graphBase()}/${version()}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("access_token", process.env.FB_PAGE_TOKEN ?? "")
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    // Facebook's message, never the URL (it carries the token).
    const e = body.error ?? {}
    const hint = e.code === 190 ? " The Page access token has expired or was revoked — create a new one." : ""
    throw new GraphError(`Facebook said: ${e.message ?? `HTTP ${res.status}`}.${hint}`)
  }
  return body as T
}

type Reel = { id: string; description?: string; created_time?: string; updated_time?: string | number }

async function newestReel(): Promise<Reel | undefined> {
  const { data } = await graph<{ data: Reel[] }>(`${process.env.FB_PAGE_ID}/video_reels`, {
    fields: "id,description,created_time,updated_time",
    limit: "10",
  })
  const time = (r: Reel) => String(r.created_time ?? r.updated_time ?? "")
  return [...(data ?? [])].sort((a, b) => time(b).localeCompare(time(a)))[0]
}

// Only download from Facebook's video CDN (or the test stand-in).
function allowedSource(src: string) {
  try {
    const u = new URL(src)
    if (process.env.FB_GRAPH_BASE && u.origin === new URL(process.env.FB_GRAPH_BASE).origin) return true
    return u.protocol === "https:" && (/\.fbcdn\.net$/.test(u.hostname) || /(^|\.)facebook\.com$/.test(u.hostname))
  } catch {
    return false
  }
}

async function download(src: string) {
  const res = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(120_000) })
  if (!res.ok || !res.body) throw new GraphError(`Couldn't download the reel (HTTP ${res.status}).`)
  if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw new GraphError("The newest reel is larger than 40 MB.")
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_VIDEO_BYTES) {
      await reader.cancel()
      throw new GraphError("The newest reel is larger than 40 MB.")
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export type SyncResult = { status: "updated" | "unchanged" | "skipped"; reason?: string } | { status: "error"; error: string }

// Checks Facebook and, if there's a newer reel, copies it in and makes it
// the background video. `force` = the admin pressed "Sync now" (also switches
// the page back to Facebook reels after a manual upload).
export async function syncFacebookReel({ force = false } = {}): Promise<SyncResult> {
  if (!configured()) return { status: "skipped", reason: "Facebook isn't connected (FB_PAGE_ID / FB_PAGE_TOKEN)." }
  // One sync at a time across all server instances: a 5-minute lease row
  // (a session lock wouldn't survive the connection pool).
  const now = new Date().toISOString()
  const lease = await q(
    `INSERT INTO kv (key, value) VALUES ('facebook_sync_lease', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE kv.value < $2
     RETURNING 1`,
    [new Date(Date.now() + 5 * 60 * 1000).toISOString(), now]
  )
  if (!lease.length) return { status: "skipped", reason: "A sync is already running." }
  try {
    const settings = await getSettings()
    if (!force && (settings.coverVideoFrom === "upload" || settings.coverVideoFrom === "none")) {
      return { status: "skipped", reason: settings.coverVideoFrom === "upload" ? "An uploaded video is in use." : "The background video is switched off." }
    }
    await writeState({ lastAttemptAt: now })

    const reel = await newestReel()
    if (!reel) {
      await writeState({ lastSuccessAt: now, lastError: "" })
      return { status: "unchanged", reason: "The page has no reels yet." }
    }
    const state = await readState()
    if (state.videoId === reel.id && settings.coverVideo && settings.coverVideoFrom === "facebook") {
      await writeState({ lastSuccessAt: now, lastError: "" })
      return { status: "unchanged" }
    }

    const video = await graph<{ source?: string; permalink_url?: string }>(reel.id, { fields: "source,permalink_url" })
    if (!video.source) throw new GraphError("Facebook didn't return the reel's video file. Check the token's permissions.")
    if (!allowedSource(video.source)) throw new GraphError("Facebook returned an unexpected video address.")
    const bytes = await download(video.source)
    const meta = await saveFile({ ownerType: "cover_video", ownerId: "settings", bytes, fileName: `facebook-reel-${reel.id}.mp4` })
    await setCoverVideo(meta.url, "facebook")
    const permalink = video.permalink_url
      ? new URL(video.permalink_url, "https://www.facebook.com").toString()
      : `https://www.facebook.com/reel/${reel.id}`
    await writeState({
      lastSuccessAt: now,
      lastError: "",
      videoId: reel.id,
      permalink,
      postedAt: reel.created_time ? String(reel.created_time) : undefined,
      description: reel.description?.slice(0, 200),
    })
    return { status: "updated" }
  } catch (err) {
    const error = err instanceof GraphError ? err.message : err instanceof Error && err.name === "TimeoutError" ? "Facebook didn't answer in time." : "Sync failed."
    if (!(err instanceof GraphError)) console.error("Facebook sync failed:", err instanceof Error ? err.message : err)
    await writeState({ lastError: error }).catch(() => {})
    return { status: "error", error }
  } finally {
    await q("DELETE FROM kv WHERE key = 'facebook_sync_lease'").catch(() => {})
  }
}

// Called after public page loads: checks at most every 30 minutes.
export async function syncFacebookReelIfDue() {
  if (!configured()) return
  const { lastAttemptAt } = await readState()
  if (lastAttemptAt && Date.now() - Date.parse(lastAttemptAt) < CHECK_EVERY_MS) return
  await syncFacebookReel()
}
