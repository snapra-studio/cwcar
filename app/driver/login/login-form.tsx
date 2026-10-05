"use client"

import * as React from "react"
import { EyeIcon, EyeOffIcon, LogInIcon } from "lucide-react"

import { driverLogin } from "@/app/driver/login/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = React.useActionState(driverLogin, undefined)
  const [show, setShow] = React.useState(false)

  return (
    <form action={action}>
      <input type="hidden" name="next" value={next ?? ""} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Username</FieldLabel>
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
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              aria-invalid={!!state?.error}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        {state?.error && <FieldError role="alert">{state.error}</FieldError>}
        <Button type="submit" size="lg" className="w-full rounded-full" disabled={pending}>
          <LogInIcon data-icon="inline-start" />
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  )
}
