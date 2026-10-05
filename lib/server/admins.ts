import "server-only"

import { checkAdminCredentials } from "@/lib/auth"
import { uid } from "@/lib/bridal/format"
import { q, type Row } from "@/lib/server/db"
import { UserError } from "@/lib/server/errors"
import {
  newRecoveryCodes,
  newSecret,
  newToken,
  normalizeRecovery,
  otpauthUri,
  seal,
  sha256,
  unseal,
  verifyCode,
} from "@/lib/server/totp"

// Admin accounts (AUTHORITATIVE: the admins table). Sign-in is email + a
// 6-digit Google Authenticator code; there are no admin passwords.
//
//   super admin  invites admins (and other super admins), approves them,
//                suspends, removes, resets their authenticator, changes their
//                role. The first one is set up once from the old .env.local
//                admin email + password; later ones are invited like admins.
//                A super admin can't act on their own account, so there is
//                always at least one active super admin.
//   admin        invited by email -> sets up the app from the link ->
//                "pending" until a super admin approves -> "active".

export type AdminRole = "super_admin" | "admin"
export type AdminStatus = "invited" | "pending" | "active" | "suspended"

export type AdminView = {
  id: string
  email: string
  name: string
  role: AdminRole
  status: AdminStatus
  createdAt: string
  approvedAt?: string
  lastLoginAt?: string
  inviteExpiresAt?: string
  inviteExpired: boolean
  invitedBy?: string
  recoveryLeft: number
}

const INVITE_HOURS = 72

const str = (v: unknown) => (v == null ? undefined : String(v))

function toView(r: Row): AdminView {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name ?? ""),
    role: r.role as AdminRole,
    status: r.status as AdminStatus,
    createdAt: String(r.created_at),
    approvedAt: str(r.approved_at),
    lastLoginAt: str(r.last_login_at),
    inviteExpiresAt: str(r.invite_expires_at),
    inviteExpired: r.status === "invited" && !!r.invite_expires_at && Date.parse(String(r.invite_expires_at)) < Date.now(),
    invitedBy: str(r.invited_by),
    recoveryLeft: Array.isArray(r.recovery_hashes) ? r.recovery_hashes.length : 0,
  }
}

const cleanEmail = (e: string) => e.trim().toLowerCase()

export async function listAdmins() {
  return (await q("SELECT * FROM admins ORDER BY role = 'super_admin' DESC, created_at")).map(toView)
}

export async function getAdmin(id: string) {
  const [r] = await q("SELECT * FROM admins WHERE id = $1", [id])
  return r ? toView(r) : undefined
}

// The best super admin status there is ("active" if any super admin is):
// the login page offers first-run setup until one is active.
export async function hasSuperAdmin() {
  const [r] = await q("SELECT status FROM admins WHERE role = 'super_admin' ORDER BY status = 'active' DESC LIMIT 1")
  return r ? { status: String(r.status) as AdminStatus } : null
}

async function setInvite(id: string) {
  const token = newToken()
  await q(
    `UPDATE admins SET invite_token_hash = $2, invite_expires_at = now() + make_interval(hours => $3), updated_at = now()
     WHERE id = $1`,
    [id, sha256(token), INVITE_HOURS]
  )
  return token
}

// ---- First run: turn the old .env.local admin into the super admin ----

export async function startSuperAdminSetup(email: string, password: string) {
  if (!checkAdminCredentials(email, password)) throw new UserError("Wrong email or password.")
  const [active] = await q("SELECT 1 FROM admins WHERE role = 'super_admin' AND status = 'active' LIMIT 1")
  if (active) throw new UserError("The super admin is already set up. Sign in with your code.")
  // The first super admin is the one nobody invited.
  const [first] = await q("SELECT id FROM admins WHERE role = 'super_admin' AND invited_by IS NULL LIMIT 1")
  const id = first
    ? String(first.id)
    : String(
        (
          await q(
            `INSERT INTO admins (id, email, name, role, status) VALUES ($1, $2, 'Super admin', 'super_admin', 'invited')
             RETURNING id`,
            [uid(), cleanEmail(email)]
          )
        )[0].id
      )
  return setInvite(id)
}

// ---- Super admin: manage admins ----

export async function inviteAdmin(input: { email: string; name: string; role: AdminRole }, invitedBy: string) {
  const email = cleanEmail(input.email)
  const [existing] = await q("SELECT status FROM admins WHERE lower(email) = $1", [email])
  if (existing) {
    const s = String(existing.status)
    throw new UserError(
      s === "invited"
        ? "This email already has an invitation. Use “Send invitation again”."
        : s === "pending"
          ? "This person is waiting for your approval."
          : "This email is already an admin."
    )
  }
  const [row] = await q(
    `INSERT INTO admins (id, email, name, role, status, invited_by) VALUES ($1, $2, $3, $4, 'invited', $5) RETURNING *`,
    [uid(), email, input.name.trim(), input.role, invitedBy]
  )
  const token = await setInvite(String(row.id))
  return { admin: toView(row), token }
}

// Rules shared by every action on another admin: never on your own account
// (so the super admin doing it always remains).
async function target(id: string, actorId: string) {
  const [r] = await q("SELECT * FROM admins WHERE id = $1", [id])
  if (!r) throw new UserError("That admin no longer exists.")
  if (r.id === actorId) throw new UserError("You can't do that to your own account.")
  return r
}

// Make someone a super admin, or a regular admin again. A regular admin
// loses any recovery codes (only super admins have them).
export async function setRole(id: string, actorId: string, role: AdminRole) {
  await target(id, actorId)
  const [r] = await q(
    `UPDATE admins SET role = $2, updated_at = now(),
       recovery_hashes = CASE WHEN $2 = 'admin' THEN '{}' ELSE recovery_hashes END
     WHERE id = $1 AND role <> $2 RETURNING *`,
    [id, role]
  )
  if (!r) throw new UserError(role === "super_admin" ? "They're already a super admin." : "They're already a regular admin.")
  return toView(r)
}

export async function resendInvite(id: string, actorId: string) {
  const r = await target(id, actorId)
  if (r.status !== "invited") throw new UserError("Only invitations that haven't been used can be sent again.")
  return { admin: toView(r), token: await setInvite(id) }
}

// Lost or new phone: the admin sets the app up again from a new link, and
// must be approved again.
export async function resetAuthenticator(id: string, actorId: string) {
  await target(id, actorId)
  await q(
    `UPDATE admins SET status = 'invited', totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL,
       recovery_hashes = '{}', updated_at = now() WHERE id = $1`,
    [id]
  )
  const token = await setInvite(id)
  return { admin: (await getAdmin(id))!, token }
}

export async function approveAdmin(id: string, actorId: string) {
  await target(id, actorId)
  const [r] = await q(
    `UPDATE admins SET status = 'active', approved_by = $2, approved_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, actorId]
  )
  if (!r) throw new UserError("Only admins waiting for approval can be approved.")
  return toView(r)
}

export async function setSuspended(id: string, actorId: string, suspended: boolean) {
  await target(id, actorId)
  const [r] = await q(
    `UPDATE admins SET status = $2, updated_at = now() WHERE id = $1 AND status = $3 RETURNING *`,
    [id, suspended ? "suspended" : "active", suspended ? "active" : "suspended"]
  )
  if (!r) throw new UserError(suspended ? "Only active admins can be suspended." : "Only suspended admins can be turned back on.")
  return toView(r)
}

export async function removeAdmin(id: string, actorId: string) {
  await target(id, actorId)
  await q("DELETE FROM admins WHERE id = $1", [id])
}

// ---- Setup from the emailed link ----

async function byToken(token: string) {
  const [r] = await q(
    "SELECT * FROM admins WHERE invite_token_hash = $1 AND invite_expires_at > now() AND status = 'invited'",
    [sha256(token)]
  )
  return r
}

// What the setup page shows: who it's for and the QR code contents. The
// secret is created once per link (so reloading shows the same QR).
export async function setupDetails(token: string) {
  const r = await byToken(token)
  if (!r) return null
  let secret: string
  if (r.totp_pending) secret = unseal(String(r.totp_pending))
  else {
    secret = newSecret()
    await q("UPDATE admins SET totp_pending = $2 WHERE id = $1", [r.id, seal(secret)])
  }
  return { email: String(r.email), name: String(r.name ?? ""), role: r.role as AdminRole, secret, otpauth: otpauthUri(String(r.email), secret) }
}

// The first code from the app proves it's set up. The first super admin
// (nobody invited them) becomes active straight away; everyone invited,
// super admins included, waits for approval. Super admins get recovery codes.
export async function finishSetup(token: string, code: string) {
  const r = await byToken(token)
  if (!r || !r.totp_pending) throw new UserError("This setup link has expired or was already used. Ask the super admin for a new one.")
  const secret = unseal(String(r.totp_pending))
  const step = verifyCode(secret, code)
  if (step === null) throw new UserError("That code isn't right. Check the app shows “Chrish Wedding Cars” and try the newest code.")
  const isSuper = r.role === "super_admin"
  const first = isSuper && r.invited_by == null
  const codes = isSuper ? newRecoveryCodes() : []
  const [row] = await q(
    `UPDATE admins SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = $2, invite_token_hash = NULL,
       invite_expires_at = NULL, status = $3, recovery_hashes = $4, updated_at = now(),
       approved_at = CASE WHEN $3 = 'active' THEN now() ELSE approved_at END
     WHERE id = $1 AND status = 'invited' RETURNING *`,
    [r.id, step, first ? "active" : "pending", codes.map((c) => sha256(c))]
  )
  if (!row) throw new UserError("This setup link was already used.")
  return { admin: toView(row), recoveryCodes: codes }
}

// ---- Sign in ----

// The admin, if the code is right for an active account. Each code works
// once: the time step is stored, and an equal or older step is refused.
export async function verifySignIn(email: string, code: string) {
  const [r] = await q("SELECT * FROM admins WHERE lower(email) = $1 AND status = 'active' AND totp_secret IS NOT NULL", [
    cleanEmail(email),
  ])
  if (!r) return null
  const step = verifyCode(unseal(String(r.totp_secret)), code)
  if (step === null) return null
  const [ok] = await q(
    `UPDATE admins SET totp_last_step = $2, last_login_at = now()
     WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2) RETURNING *`,
    [r.id, step]
  )
  return ok ? toView(ok) : null
}

// A one-time recovery code instead of the app (super admin, lost phone).
export async function verifyRecovery(email: string, code: string) {
  const hash = sha256(normalizeRecovery(code))
  const [r] = await q(
    `UPDATE admins SET recovery_hashes = array_remove(recovery_hashes, $2), last_login_at = now()
     WHERE lower(email) = $1 AND status = 'active' AND $2 = ANY(recovery_hashes) RETURNING *`,
    [cleanEmail(email), hash]
  )
  return r ? toView(r) : null
}

// ---- Own account ----

// Moving to a new phone: show a new QR, switch once a code from it works.
export async function startPhoneChange(id: string) {
  const [r] = await q("SELECT email FROM admins WHERE id = $1 AND status = 'active'", [id])
  if (!r) throw new UserError("Your account isn't active.")
  const secret = newSecret()
  await q("UPDATE admins SET totp_pending = $2, updated_at = now() WHERE id = $1", [id, seal(secret)])
  return { secret, otpauth: otpauthUri(String(r.email), secret) }
}

export async function finishPhoneChange(id: string, code: string) {
  const [r] = await q("SELECT totp_pending FROM admins WHERE id = $1 AND status = 'active'", [id])
  if (!r?.totp_pending) throw new UserError("Start again: press “Move to a new phone”.")
  const step = verifyCode(unseal(String(r.totp_pending)), code)
  if (step === null) throw new UserError("That code isn't right. Use the newest code from the new phone.")
  await q(
    "UPDATE admins SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = $2, updated_at = now() WHERE id = $1",
    [id, step]
  )
}

export async function replaceRecoveryCodes(id: string) {
  const codes = newRecoveryCodes()
  await q("UPDATE admins SET recovery_hashes = $2, updated_at = now() WHERE id = $1 AND role = 'super_admin'", [
    id,
    codes.map((c) => sha256(c)),
  ])
  return codes
}

// Every active super admin (they all get "waiting for approval" emails).
export async function superAdminEmails() {
  return (await q("SELECT email FROM admins WHERE role = 'super_admin' AND status = 'active' ORDER BY created_at")).map((r) =>
    String(r.email)
  )
}
