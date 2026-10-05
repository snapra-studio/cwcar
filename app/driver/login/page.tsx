import type { Metadata } from "next"

import { LoginForm } from "@/app/driver/login/login-form"
import { LoginScreen } from "@/components/login-screen"

export const metadata: Metadata = { title: "Driver login · Crish Wedding Hires" }

export default async function DriverLoginPage({ searchParams }: PageProps<"/driver/login">) {
  const { next } = await searchParams
  return (
    <LoginScreen title="Driver login" subtitle="Sign in to see the hires assigned to you.">
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </LoginScreen>
  )
}
