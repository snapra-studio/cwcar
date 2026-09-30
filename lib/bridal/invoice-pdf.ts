import { toJpeg } from "html-to-image"
import { jsPDF } from "jspdf"

// Captures the rendered InvoiceSheet (fonts included) and places it on a
// single A4 page, so the PDF looks exactly like the on-screen template.
export async function downloadInvoicePdf(sheet: HTMLElement, fileName: string) {
  await document.fonts.ready
  const image = await toJpeg(sheet, {
    quality: 0.95,
    pixelRatio: 3,
    backgroundColor: "#ffffff",
    width: sheet.offsetWidth,
    height: sheet.offsetHeight,
  })
  // Always a printable A4 page: a sheet that grew taller (several cars or
  // many stops) is shrunk to fit and centred horizontally.
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const height = Math.min(297, (210 * sheet.offsetHeight) / sheet.offsetWidth)
  const width = (height * sheet.offsetWidth) / sheet.offsetHeight
  doc.addImage(image, "JPEG", (210 - width) / 2, 0, width, height)
  doc.save(fileName)
}
