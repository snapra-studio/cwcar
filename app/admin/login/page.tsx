import type { Metadata } from "next"
import { connection } from "next/server"

import { AdminLoginForm, FirstSetupForm } from "@/app/admin/login/admin-login-form"
import { LoginScreen } from "@/components/login-screen"
import { hasSuperAdmin } from "@/lib/server/admins"

export const metadata: Metadata = { title: "Admin login · Crish Wedding Hires" }

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  await connection()
  const { next } = await searchParams
  const superAdmin = await hasSuperAdmin()
  // Until the super admin has set up Google Authenticator, this page does
  // that one-time setup instead.
  if (!superAdmin || superAdmin.status === "invited") {
    return (
      <LoginScreen title="Set up admin sign-in" subtitle="One time only: confirm it's you, then link Google Authenticator.">
        <FirstSetupForm />
      </LoginScreen>
    )
  }
  return (
    <LoginScreen title="Admin login" subtitle="Your email and the code from Google Authenticator.">
      <AdminLoginForm next={typeof next === "string" ? next : undefined} />
    </LoginScreen>
  )
}
