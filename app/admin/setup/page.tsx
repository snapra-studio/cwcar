import type { Metadata } from "next"
import { connection } from "next/server"
import QRCode from "qrcode"

import { SetupFlow } from "@/app/admin/setup/setup-flow"
import { LoginScreen } from "@/components/login-screen"
import { setupDetails } from "@/lib/server/admins"

// The setup link's token must never leak to other sites through Referer.
export const metadata: Metadata = { title: "Set up admin sign-in · Crish Wedding Hires", referrer: "no-referrer" }

// Opened from the invitation email (or right after the first-run check):
// scan the QR code with Google Authenticator, then type the first code.
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  await connection()
  const { token } = await searchParams
  const details = typeof token === "string" ? await setupDetails(token) : null
  if (!details || typeof token !== "string") {
    return (
      <LoginScreen title="This link has expired" subtitle="Setup links work for 3 days and only once.">
        <p className="text-center text-sm text-muted-foreground">
          Ask the super admin to send you a new invitation, or <a href="/admin/login" className="font-medium text-primary hover:underline">go to admin login</a>.
        </p>
      </LoginScreen>
    )
  }
  const qr = await QRCode.toDataURL(details.otpauth, { margin: 1, width: 240, errorCorrectionLevel: "M" })
  return (
    <LoginScreen
      title={details.role === "super_admin" ? "Set up super admin sign-in" : `Welcome${details.name ? `, ${details.name}` : ""}`}
      subtitle={details.email}
    >
      <SetupFlow token={token} qr={qr} secret={details.secret} superAdmin={details.role === "super_admin"} />
    </LoginScreen>
  )
}
