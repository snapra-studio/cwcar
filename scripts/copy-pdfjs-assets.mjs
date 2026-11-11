// Copies PDF.js's helper files into public/pdfjs/ so the brochure viewer
// (components/public/brochure-flipbook.tsx) can load them from our own site:
//   wasm/            image decoders (JPEG 2000 photos, JBIG2) and colour management
//   cmaps/           character maps for non-Latin fonts
//   standard_fonts/  the 14 standard PDF fonts
//   iccs/            colour profiles
// Runs after every `npm install` (and before dev/build), so the files always
// match the installed pdfjs-dist version. public/pdfjs/ is not committed.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const from = path.join(root, "node_modules", "pdfjs-dist")
const to = path.join(root, "public", "pdfjs")

if (!fs.existsSync(from)) {
  console.warn("copy-pdfjs-assets: pdfjs-dist is not installed; skipped.")
  process.exit(0)
}
fs.rmSync(to, { recursive: true, force: true })
for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  fs.cpSync(path.join(from, dir), path.join(to, dir), { recursive: true })
}
const { version } = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"))
fs.writeFileSync(path.join(to, "VERSION"), version + "\n")
console.log(`copy-pdfjs-assets: PDF.js ${version} helper files -> public/pdfjs/`)
