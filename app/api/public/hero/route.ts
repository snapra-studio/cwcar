import { getPublicCars, getSettings } from "@/lib/server/repo"

// Public hero photo for the customer availability page: the landing
// background the admin uploaded on Home, else the first fleet photo.
// Served as an image so the big data URL isn't repeated in every API call.
export function GET() {
  const dataUrl = getSettings().coverImage ?? getPublicCars().find((c) => c.image)?.image
  const match = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
  if (!match) return new Response(null, { status: 404 })
  return new Response(Buffer.from(match[2], "base64"), {
    headers: { "Content-Type": match[1], "Cache-Control": "public, max-age=300" },
  })
}
