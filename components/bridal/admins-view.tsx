"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  MailIcon,
  MailWarningIcon,
  RotateCcwIcon,
  SendIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmAction } from "@/components/bridal/confirm-action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  approveAdminAction,
  finishPhoneChangeAction,
  inviteAdminAction,
  newRecoveryCodesAction,
  removeAdminAction,
  resendInviteAction,
  resetAuthenticatorAction,
  setRoleAction,
  setSuspendedAction,
  startPhoneChangeAction,
  type InviteOutcome,
} from "@/lib/server/admin-users-actions"
import type { AdminView } from "@/lib/server/admins"
import { cn } from "@/lib/utils"

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""

const STATUS: Record<AdminView["status"], { label: string; className: string }> = {
  invited: { label: "Invited", className: "border-sky-500/40 bg-sky-500/10 text-sky-800" },
  pending: { label: "Waiting for approval", className: "border-amber-500/50 bg-amber-500/15 text-amber-900" },
  active: { label: "Active", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" },
  suspended: { label: "Suspended", className: "border-rose-500/40 bg-rose-500/10 text-rose-800" },
}

export function AdminsView({ me, admins, mailReady }: { me: AdminView; admins: AdminView[]; mailReady: boolean }) {
  const isSuper = me.role === "super_admin"
  const [link, setLink] = React.useState<InviteOutcome | null>(null)
  const pending = admins.filter((a) => a.status === "pending")

  return (
    <div className="grid gap-4">
      <MySignIn me={me} />

      {isSuper && (
        <>
          {!mailReady && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <MailWarningIcon className="mt-0.5 size-4 shrink-0" />
              Email isn&apos;t set up yet (SMTP in .env.local), so invitations can&apos;t be emailed. After inviting someone
              you&apos;ll get their setup link to send yourself (WhatsApp, etc.).
            </p>
          )}
          <InviteCard onLink={setLink} />
          {pending.length > 0 && (
            <p className="rounded-xl border border-amber-500/50 bg-amber-500/15 p-3 text-sm font-medium">
              {pending.length} admin{pending.length === 1 ? " is" : "s are"} waiting for your approval.
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Admins</CardTitle>
              <CardDescription>
                Everyone who can open this dashboard. Each signs in with their email and Google Authenticator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {admins.map((a) => (
                  <AdminRow key={a.id} a={a} me={me} onLink={setLink} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{link?.emailed ? "Invitation sent" : "Send this setup link"}</DialogTitle>
            <DialogDescription>
              {link?.emailed
                ? `We emailed ${link.admin.email} a setup link. You can also share it yourself:`
                : `The email couldn't be sent. Send this link to ${link?.admin.email} yourself — it works once and expires in 3 days.`}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all select-all">{link?.link}</p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (link) void navigator.clipboard?.writeText(link.link)
                toast.success("Link copied")
              }}
            >
              <CopyIcon data-icon="inline-start" />
              Copy link
            </Button>
            <Button type="button" onClick={() => setLink(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InviteCard({ onLink }: { onLink: (o: InviteOutcome) => void }) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [role, setRole] = React.useState<"admin" | "super_admin">("admin")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const r = await inviteAdminAction({ email, name, role })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setEmail("")
    setName("")
    setRole("admin")
    router.refresh()
    if (r.data.emailed) toast.success(`Invitation emailed to ${r.data.admin.email}`)
    onLink(r.data)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlusIcon className="size-5 text-primary" />
          Add an admin
        </CardTitle>
        <CardDescription>
          They get an email with a link to set up Google Authenticator. You approve them before they can sign in. A super
          admin can also add, approve and manage other admins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_10rem_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="invName">Name</FieldLabel>
            <Input id="invName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kasun" />
          </Field>
          <Field>
            <FieldLabel htmlFor="invEmail">Email</FieldLabel>
            <Input id="invEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="invRole">Role</FieldLabel>
            <NativeSelect id="invRole" className="w-full" value={role} onChange={(e) => setRole(e.target.value as "admin" | "super_admin")}>
              <NativeSelectOption value="admin">Admin</NativeSelectOption>
              <NativeSelectOption value="super_admin">Super admin</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button type="submit" className="rounded-full" disabled={busy}>
            <SendIcon data-icon="inline-start" />
            {busy ? "Sending…" : "Send invitation"}
          </Button>
          {error && <FieldError className="sm:col-span-4">{error}</FieldError>}
        </form>
      </CardContent>
    </Card>
  )
}

function AdminRow({ a, me, onLink }: { a: AdminView; me: AdminView; onLink: (o: InviteOutcome) => void }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const self = a.id === me.id
  const expired = a.inviteExpired

  async function act<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: (data: T) => void) {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.ok) return void toast.error(r.error)
    done(r.data)
    router.refresh()
  }

  const linkDone = (o: InviteOutcome) => {
    if (o.emailed) toast.success(`Setup link emailed to ${o.admin.email}`)
    onLink(o)
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{a.name || a.email}</span>
          {a.role === "super_admin" && (
            <Badge>
              <ShieldCheckIcon />
              Super admin
            </Badge>
          )}
          {self && <Badge variant="outline">You</Badge>}
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS[a.status].className)}>
            {expired ? "Invitation expired" : STATUS[a.status].label}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {a.name && <span>{a.email} · </span>}
          {a.status === "invited"
            ? expired
              ? "Send the invitation again"
              : `Link expires ${when(a.inviteExpiresAt)}`
            : a.lastLoginAt
              ? `Last signed in ${when(a.lastLoginAt)}`
              : a.status === "pending"
                ? "Set up Google Authenticator; needs your approval"
                : "Hasn't signed in yet"}
        </div>
      </div>
      {!self && (
        <div className="flex flex-wrap gap-1.5">
          {a.status === "pending" && (
            <Button size="sm" className="rounded-full" disabled={busy} onClick={() => act(() => approveAdminAction(a.id), (d) => toast.success(`${a.name || a.email} approved${d.emailed ? " — we emailed them" : ""}`))}>
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
          )}
          {a.status === "invited" && (
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => act(() => resendInviteAction(a.id), linkDone)}>
              <MailIcon data-icon="inline-start" />
              Send invitation again
            </Button>
          )}
          {a.status === "active" && (
            <ConfirmAction
              trigger={
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Reset authenticator
                </Button>
              }
              title={`Reset ${a.name || a.email}'s sign-in?`}
              description="Use this if they lost or changed their phone. They're signed out, get a new setup link, and need your approval again."
              confirmLabel="Reset and send link"
              onConfirm={() => act(() => resetAuthenticatorAction(a.id), linkDone)}
            />
          )}
          {(a.status === "active" || a.status === "suspended") && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() =>
                act(
                  () => setSuspendedAction(a.id, a.status === "active"),
                  () => toast.success(a.status === "active" ? `${a.name || a.email} can't sign in now` : `${a.name || a.email} can sign in again`)
                )
              }
            >
              {a.status === "active" ? "Suspend" : "Turn back on"}
            </Button>
          )}
          {(a.status === "active" || a.status === "suspended") && (
            <ConfirmAction
              trigger={
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy}>
                  <ShieldCheckIcon data-icon="inline-start" />
                  {a.role === "super_admin" ? "Make regular admin" : "Make super admin"}
                </Button>
              }
              title={a.role === "super_admin" ? `Make ${a.name || a.email} a regular admin?` : `Make ${a.name || a.email} a super admin?`}
              description={
                a.role === "super_admin"
                  ? "They keep using the dashboard but can no longer add, approve or manage admins. Their recovery codes stop working."
                  : "They'll be able to add, approve, suspend and remove admins, including you. They can make recovery codes on their Admins page."
              }
              confirmLabel={a.role === "super_admin" ? "Make regular admin" : "Make super admin"}
              onConfirm={() =>
                act(
                  () => setRoleAction(a.id, a.role === "super_admin" ? "admin" : "super_admin"),
                  (d) => toast.success(`${d.name || d.email} is now ${d.role === "super_admin" ? "a super admin" : "a regular admin"}`)
                )
              }
            />
          )}
          <ConfirmAction
            trigger={
              <Button size="sm" variant="destructive" className="rounded-full" disabled={busy}>
                {a.status === "pending" ? "Reject" : a.status === "invited" ? "Cancel invitation" : "Remove"}
              </Button>
            }
            title={`${a.status === "pending" ? "Reject" : "Remove"} ${a.name || a.email}?`}
            description="They lose access to the dashboard straight away. You can invite them again later."
            confirmLabel={a.status === "pending" ? "Reject" : "Remove"}
            onConfirm={() => act(() => removeAdminAction(a.id), () => toast.success("Removed"))}
          />
        </div>
      )}
    </li>
  )
}

// Own account: move sign-in to a new phone; super admin: recovery codes.
function MySignIn({ me }: { me: AdminView }) {
  const router = useRouter()
  const [phone, setPhone] = React.useState<{ qr: string; secret: string } | null>(null)
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [codes, setCodes] = React.useState<string[] | null>(null)

  async function startPhone() {
    setBusy(true)
    const r = await startPhoneChangeAction()
    setBusy(false)
    if (!r.ok) return void toast.error(r.error)
    setCode("")
    setError("")
    setPhone(r.data)
  }

  async function finishPhone(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await finishPhoneChangeAction(code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setPhone(null)
    toast.success("Sign-in moved to your new phone. Codes from the old phone no longer work.")
  }

  async function newCodes() {
    const r = await newRecoveryCodesAction()
    if (!r.ok) return void toast.error(r.error)
    setCodes(r.data)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRoundIcon className="size-5 text-primary" />
          Your sign-in
        </CardTitle>
        <CardDescription>
          {me.email} · signs in with Google Authenticator
          {me.lastLoginAt && ` · last sign-in ${when(me.lastLoginAt)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={startPhone}>
          <SmartphoneIcon data-icon="inline-start" />
          Move to a new phone
        </Button>
        {me.role === "super_admin" && (
          <>
            <ConfirmAction
              trigger={
                <Button variant="outline" className="rounded-full">
                  <KeyRoundIcon data-icon="inline-start" />
                  New recovery codes
                </Button>
              }
              title="Make new recovery codes?"
              description="Your old recovery codes stop working. Save the new ones somewhere safe."
              confirmLabel="Make new codes"
              onConfirm={newCodes}
            />
            <span className={cn("text-sm", me.recoveryLeft <= 2 ? "font-medium text-amber-700" : "text-muted-foreground")}>
              {me.recoveryLeft} recovery code{me.recoveryLeft === 1 ? "" : "s"} left
            </span>
          </>
        )}
      </CardContent>

      <Dialog open={!!phone} onOpenChange={(o) => !o && setPhone(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to a new phone</DialogTitle>
            <DialogDescription>Scan this with Google Authenticator on the new phone, then type the code it shows.</DialogDescription>
          </DialogHeader>
          {phone && (
            <form onSubmit={finishPhone} className="grid gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated QR code (data URL) */}
              <img src={phone.qr} alt="QR code for Google Authenticator" className="mx-auto size-48 rounded-xl border bg-white p-2" />
              <p className="text-center font-mono text-xs break-all text-muted-foreground select-all">{phone.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
              <Field>
                <FieldLabel htmlFor="newPhoneCode">Code from the new phone</FieldLabel>
                <Input
                  id="newPhoneCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-center font-mono text-xl tracking-[0.35em]"
                />
                <FieldDescription>Until you finish, the old phone keeps working.</FieldDescription>
              </Field>
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" disabled={busy}>
                {busy ? "Checking…" : "Switch to this phone"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!codes} onOpenChange={(o) => !o && setCodes(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Your new recovery codes</DialogTitle>
            <DialogDescription>Each signs you in once if you lose your phone. They won&apos;t be shown again.</DialogDescription>
          </DialogHeader>
          <ul className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-3 text-center font-mono text-sm">
            {codes?.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => codes && navigator.clipboard?.writeText(codes.join("\n"))}>
              <CopyIcon data-icon="inline-start" />
              Copy
            </Button>
            <Button onClick={() => setCodes(null)}>I&apos;ve saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
