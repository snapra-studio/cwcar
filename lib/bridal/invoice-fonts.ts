import { Oleo_Script, Prompt } from "next/font/google"

// Fonts that match the printed Crish Wedding Hires invoice template. The logo
// itself is an image (public/logo.png).
export const invoiceSans = Prompt({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-invoice-sans",
})

export const invoiceDisplay = Oleo_Script({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-invoice-display",
})

export const invoiceFontVars = [invoiceSans, invoiceDisplay].map((f) => f.variable).join(" ")
