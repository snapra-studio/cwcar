"use client"

import * as React from "react"
import { KeyRoundIcon, LogInIcon, ShieldCheckIcon } from "lucide-react"

import { adminSignIn, startFirstSetup } from "@/app/admin/login/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function AdminLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = React.useActionState(adminSignIn, undefined)
  const [recovery, setRecovery] = React.useState(false)
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="mode" value={recovery ? "recovery" : "code"} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            defaultValue={state?.email}
            required
            autoFocus
            aria-invalid={!!state?.error}
          />
        </Field>
        {recovery ? (
          <Field>
            <FieldLabel htmlFor="code">Recovery code</FieldLabel>
            <Input id="code" name="code" autoComplete="off" placeholder="abcd-efgh" required aria-invalid={!!state?.error} />
            <FieldDescription>One of the codes you saved when you set up sign-in. Each works once.</FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="code">6-digit code</FieldLabel>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="123 456"
              required
              aria-invalid={!!state?.error}
              className="text-center font-mono text-xl tracking-[0.35em]"
            />
            <FieldDescription>Open Google Authenticator and type the code under “Chrish Wedding Cars”.</FieldDescription>
          </Field>
        )}
        {state?.error && <FieldError role="alert">{state.error}</FieldError>}
        <Button type="submit" size="lg" className="w-full rounded-full" disabled={pending}>
          <LogInIcon data-icon="inline-start" />
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={() => setRecovery((r) => !r)}
          className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <KeyRoundIcon className="size-4" />
          {recovery ? "Use the Authenticator code" : "Lost your phone? Use a recovery code"}
        </button>
      </FieldGroup>
    </form>
  )
}

export function FirstSetupForm() {
  const [state, action, pending] = React.useActionState(startFirstSetup, undefined)
  return (
    <form action={action}>
      <FieldGroup>
        <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
          Admin sign-in is moving to Google Authenticator. Enter the current admin email and password one last time; next
          you&apos;ll scan a QR code with the app. You become the <strong>super admin</strong>, who can add other admins.
        </p>
        <Field>
          <FieldLabel htmlFor="email">Admin email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" defaultValue={state?.email} required autoFocus />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Current password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state?.error && <FieldError role="alert">{state.error}</FieldError>}
        <Button type="submit" size="lg" className="w-full rounded-full" disabled={pending}>
          <ShieldCheckIcon data-icon="inline-start" />
          {pending ? "Checking…" : "Continue to Authenticator setup"}
        </Button>
      </FieldGroup>
    </form>
  )
}
