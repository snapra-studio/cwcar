import type { Metadata } from "next"

import { LoginScreen } from "@/components/login-screen"

export const metadata: Metadata = { title: "Admin login · Crish Wedding Hires" }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams
  return (
    <LoginScreen
      title="Admin login"
      subtitle="Sign in to manage bookings and invoices."
      next={typeof next === "string" ? next : undefined}
    />
  )
}
