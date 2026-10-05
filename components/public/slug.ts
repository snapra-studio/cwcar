// Readable, search-friendly addresses for car pages, from the car's colour
// and name: "Red" + "BMW 320D" -> /wedding-cars/red-bmw-320d. Two cars with
// the same colour and name get -2, -3… in fleet order (name, then id).

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "car"

export function carSlugs<T extends { id: string; name: string; color: string }>(cars: T[]): Map<string, string> {
  const out = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const c of [...cars].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    const base = slugify(`${c.color} ${c.name}`)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.set(c.id, n === 1 ? base : `${base}-${n}`)
  }
  return out
}
