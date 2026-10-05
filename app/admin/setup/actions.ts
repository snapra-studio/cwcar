"use server"

import { finishSetup, superAdminEmails } from "@/lib/server/admins"
import { appUrl, ipKey } from "@/lib/server/app-url"
import { UserError } from "@/lib/server/errors"
import { layout, sendMail } from "@/lib/server/mailer"
import { isLocked, pause, recordFailure } from "@/lib/server/rate-limit"

export type SetupResult =
  | { ok: true; role: "super_admin" | "admin"; approved: boolean; recoveryCodes: string[] }
  | { ok: false; error: string }

// The first code from the app finishes setup. The super admin is shown
// recovery codes, then signs in normally; another admin waits for approval
// (and the super admin gets an email about it). No cookie is set here: that
// would reload the page, and the used link would show as expired.
export async function finishSetupAction(token: string, code: string): Promise<SetupResult> {
  const keys = [`setup-code:${token.slice(0, 16)}`, await ipKey()]
  if (isLocked(...keys)) return { ok: false, error: "Too many wrong codes. Wait 10 minutes and try again." }
  try {
    const { admin, recoveryCodes } = await finishSetup(String(token).slice(0, 200), String(code).slice(0, 20))
    if (admin.status === "pending") {
      const to = (await superAdminEmails()).join(", ")
      if (to) {
        const url = `${await appUrl()}/admin/dashboard/admins`
        await sendMail({
          to,
          replyTo: admin.email,
          subject: `Approve ${admin.name || admin.email} for the Chrish Wedding Cars dashboard`,
          ...(await layout({
            heading: "A new admin is ready for approval",
            lines: [
              `${admin.name || admin.email} (${admin.email}) has finished setting up sign-in for the bookings dashboard.`,
              "They can't sign in until you approve them on the Admins page.",
            ],
            button: { label: "Open the Admins page", url },
            reason: "You received this because you are a super admin of the Chrish Wedding Cars dashboard.",
          })),
        })
      }
    }
    return { ok: true, role: admin.role, approved: admin.status === "active", recoveryCodes }
  } catch (err) {
    if (!(err instanceof UserError)) throw err
    recordFailure(...keys)
    await pause()
    return { ok: false, error: err.message }
  }
}
