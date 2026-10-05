"use server"

import QRCode from "qrcode"
import { z } from "zod"

import {
  approveAdmin,
  finishPhoneChange,
  inviteAdmin,
  removeAdmin,
  replaceRecoveryCodes,
  resendInvite,
  resetAuthenticator,
  setRole,
  setSuspended,
  startPhoneChange,
  type AdminView,
} from "@/lib/server/admins"
import { appUrl } from "@/lib/server/app-url"
import { UserError } from "@/lib/server/errors"
import { Forbidden, requireAdmin, requireSuperAdmin } from "@/lib/server/guard"
import { layout, sendMail } from "@/lib/server/mailer"

// Admin accounts: everything here is checked on the server. Managing other
// admins needs the super admin; moving your own sign-in to a new phone needs
// any active admin.

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: "Only the super admin can do that." }
    if (err instanceof UserError) return { ok: false, error: err.message }
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the details." }
    console.error(err)
    return { ok: false, error: "Something went wrong. Try again." }
  }
}

const id = z.string().min(1).max(80)
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  name: z.string().trim().max(80),
  role: z.enum(["admin", "super_admin"]).default("admin"),
})
const role = z.enum(["admin", "super_admin"])

// What the super admin sees after inviting: whether the email went out, and
// the link to copy if it didn't (no SMTP yet, or the server refused).
export type InviteOutcome = { admin: AdminView; emailed: boolean; link: string }

async function sendInvite(admin: AdminView, token: string, inviter: AdminView, again = false): Promise<InviteOutcome> {
  const link = `${await appUrl()}/admin/setup?token=${encodeURIComponent(token)}`
  const who = inviter.name && inviter.name !== "Super admin" ? inviter.name : inviter.email
  const emailed = await sendMail({
    to: admin.email,
    replyTo: inviter.email,
    subject: again
      ? "Your new sign-in link for the Chrish Wedding Cars dashboard"
      : `${admin.name ? `${admin.name}, set` : "Set"} up your access to the Chrish Wedding Cars dashboard`,
    ...(await layout({
      heading: admin.name ? `Hi ${admin.name},` : "Hello,",
      lines: [
        again
          ? `${who} sent you a new link to set up sign-in for the Chrish Wedding Cars bookings dashboard.`
          : `${who} has added you as ${admin.role === "super_admin" ? "a super admin (you can also add and approve other admins)" : "an admin"} of the Chrish Wedding Cars bookings dashboard.`,
        "Sign-in uses the Google Authenticator app on your phone instead of a password. Open the link below, scan the QR code with the app, and type the 6-digit code it shows.",
        "After that, your account is approved by the business owner. The link can be used once and expires in 3 days.",
      ],
      button: { label: "Set up sign-in", url: link },
      reason: `You received this because ${inviter.email} added ${admin.email} as an admin. If you weren't expecting it, you can ignore this email.`,
    })),
  })
  return { admin, emailed, link }
}

export async function inviteAdminAction(input: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    const { admin, token } = await inviteAdmin(inviteSchema.parse(input), me.id)
    return sendInvite(admin, token, me)
  })
}

export async function resendInviteAction(adminId: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    const { admin, token } = await resendInvite(id.parse(adminId), me.id)
    return sendInvite(admin, token, me, true)
  })
}

export async function resetAuthenticatorAction(adminId: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    const { admin, token } = await resetAuthenticator(id.parse(adminId), me.id)
    return sendInvite(admin, token, me, true)
  })
}

export async function approveAdminAction(adminId: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    const admin = await approveAdmin(id.parse(adminId), me.id)
    const emailed = await sendMail({
      to: admin.email,
      replyTo: me.email,
      subject: "Your Chrish Wedding Cars dashboard account is ready",
      ...(await layout({
        heading: admin.name ? `Hi ${admin.name},` : "Hello,",
        lines: [
          "Your admin account for the Chrish Wedding Cars bookings dashboard has been approved.",
          "Sign in with your email address and the 6-digit code from Google Authenticator.",
        ],
        button: { label: "Sign in", url: `${await appUrl()}/admin` },
        reason: `You received this because your admin account (${admin.email}) was approved by ${me.email}.`,
      })),
    })
    return { admin, emailed }
  })
}

export async function setRoleAction(adminId: unknown, newRole: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    return setRole(id.parse(adminId), me.id, role.parse(newRole))
  })
}

export async function setSuspendedAction(adminId: unknown, suspended: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    return setSuspended(id.parse(adminId), me.id, z.boolean().parse(suspended))
  })
}

export async function removeAdminAction(adminId: unknown) {
  return run(async () => {
    const me = await requireSuperAdmin()
    await removeAdmin(id.parse(adminId), me.id)
  })
}

// ---- Own account ----

export async function startPhoneChangeAction() {
  return run(async () => {
    const me = await requireAdmin()
    const { secret, otpauth } = await startPhoneChange(me.id)
    return { secret, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 240, errorCorrectionLevel: "M" }) }
  })
}

export async function finishPhoneChangeAction(code: unknown) {
  return run(async () => {
    const me = await requireAdmin()
    await finishPhoneChange(me.id, z.string().max(20).parse(code))
  })
}

export async function newRecoveryCodesAction() {
  return run(async () => {
    const me = await requireSuperAdmin()
    return replaceRecoveryCodes(me.id)
  })
}
