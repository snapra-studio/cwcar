"use client"

import * as React from "react"
import { CheckCircle2Icon, CopyIcon, DownloadIcon, HourglassIcon, ShieldCheckIcon } from "lucide-react"

import { finishSetupAction } from "@/app/admin/setup/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

// Scan -> type the first code -> done (super admin: save recovery codes).
export function SetupFlow({ token, qr, secret, superAdmin }: { token: string; qr: string; secret: string; superAdmin: boolean }) {
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<null | { recoveryCodes: string[]; approved: boolean }>(null)
  const [saved, setSaved] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const r = await finishSetupAction(token, code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setDone({ recoveryCodes: r.recoveryCodes, approved: r.approved })
  }

  if (done && !superAdmin) {
    return (
      <div className="grid justify-items-center gap-3 text-center">
        <HourglassIcon className="size-10 text-primary" />
        <p className="font-medium">Google Authenticator is set up.</p>
        <p className="text-sm text-muted-foreground">
          A super admin now needs to approve your account. Once they do, sign in at <strong>/admin</strong> with your email
          and the code from the app.
        </p>
      </div>
    )
  }

  if (done) {
    const text = done.recoveryCodes.join("\n")
    return (
      <div className="grid gap-4">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2Icon className="size-5 text-emerald-600" />
          {done.approved ? "You're set up as super admin." : "Google Authenticator is set up."}
        </p>
        <p className="text-sm text-muted-foreground">
          Save these recovery codes somewhere safe (not on your phone). If you lose your phone, each code signs you in once.
          They won&apos;t be shown again.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-3 font-mono text-sm" aria-label="Recovery codes">
          {done.recoveryCodes.map((c) => (
            <li key={c} className="text-center">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => navigator.clipboard?.writeText(text)}>
            <CopyIcon data-icon="inline-start" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              const a = document.createElement("a")
              a.href = URL.createObjectURL(new Blob([`Chrish Wedding Cars — admin recovery codes\n\n${text}\n`], { type: "text/plain" }))
              a.download = "chrish-admin-recovery-codes.txt"
              a.click()
              setSaved(true)
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4" />
          I&apos;ve saved my recovery codes
        </label>
        {done.approved ? (
          <>
            <p className="text-sm text-muted-foreground">Next, sign in with your email and the newest code from the app.</p>
            <Button size="lg" className="rounded-full" disabled={!saved} onClick={() => window.location.replace("/admin/login")}>
              Go to sign in
            </Button>
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            <HourglassIcon className="mt-0.5 size-4 shrink-0" />
            Another super admin now needs to approve you. You&apos;ll get an email; then sign in at <strong>/admin</strong>{" "}
            with your email and the code from the app.
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <ol className="grid gap-1 text-sm text-muted-foreground">
        <li>1. Install <strong>Google Authenticator</strong> on your phone.</li>
        <li>2. Tap <strong>+</strong> → <strong>Scan a QR code</strong> and scan this:</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated QR code (data URL) */}
      <img src={qr} alt="QR code for Google Authenticator" width={200} height={200} className="mx-auto size-48 rounded-xl border bg-white p-2" />
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
        <p className="mt-2 rounded-lg bg-muted/50 p-2 text-center font-mono text-xs break-all select-all">
          {secret.replace(/(.{4})/g, "$1 ").trim()}
        </p>
      </details>
      <Field>
        <FieldLabel htmlFor="code">3. Type the 6-digit code it shows</FieldLabel>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123 456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center font-mono text-xl tracking-[0.35em]"
          aria-invalid={!!error}
          required
        />
        <FieldDescription>The code changes every 30 seconds; use the newest one.</FieldDescription>
      </Field>
      {error && <FieldError role="alert">{error}</FieldError>}
      <Button type="submit" size="lg" className="rounded-full" disabled={busy}>
        <ShieldCheckIcon data-icon="inline-start" />
        {busy ? "Checking…" : "Finish setup"}
      </Button>
    </form>
  )
}
