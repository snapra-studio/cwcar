import Image from "next/image"
import Link from "next/link"

import { LoginForm } from "@/app/login/login-form"

// Full-window login card on the fairy-light background, used by both the
// admin login (/login) and the driver login (/driver/login).
export function LoginScreen({ title, subtitle, next }: { title: string; subtitle: string; next?: string }) {
  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden p-4">
      <Image src="/landing-bg.svg" alt="" fill priority unoptimized sizes="100vw" className="-z-20 animate-kenburns object-cover" />
      <div className="absolute inset-0 -z-10 bg-black/35" />

      <div className="w-full max-w-sm animate-in rounded-3xl border border-white/25 bg-background/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-md duration-500 fade-in slide-in-from-bottom-4 sm:p-8">
        <div className="mb-6 grid justify-items-center gap-3 text-center">
          <Image src="/logo.png" alt="Chrish Wedding Hires" width={96} height={96} priority className="size-24" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <LoginForm next={next} />
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Looking for a car?{" "}
          <Link href="/availability" className="font-medium text-primary hover:underline">
            Check availability
          </Link>
        </p>
      </div>
    </main>
  )
}
