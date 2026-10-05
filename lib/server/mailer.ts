import "server-only"

import nodemailer, { type Transporter } from "nodemailer"

import { getSettings } from "@/lib/server/repo"

// Outgoing email (admin invitations and approvals) through your SMTP server.
// Settings in .env.local:
//   SMTP_HOST, SMTP_PORT (587 or 465), SMTP_USER, SMTP_PASS,
//   SMTP_FROM   e.g. "Chrish Wedding Cars <no-reply@yourdomain.com>"
//   SMTP_SECURE optional: "true" for port 465 (default: true when port is 465)
// Without them, nothing is sent and the caller shows the link to copy instead.

export const mailConfigured = () => !!process.env.SMTP_HOST && !!process.env.SMTP_FROM

let transport: Transporter | null = null

function getTransport() {
  const port = Number(process.env.SMTP_PORT || 587)
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  }))
}

// replyTo: a real person to answer (e.g. the super admin for an invitation);
// mail filters treat replies-go-to-a-person as a good sign.
export type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string }

// true = sent; false = not configured or the server refused (logged).
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailConfigured()) return false
  try {
    await getTransport().sendMail({ from: process.env.SMTP_FROM, ...mail })
    return true
  } catch (err) {
    console.error("Email to", mail.to, "failed:", err instanceof Error ? err.message : err)
    return false
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// A plain, personal-looking business email: a heading, short paragraphs, one
// link, and a footer saying who sent it and why. Spam filters trust messages
// that identify the business and explain themselves, and want the plain-text
// part to say the same as the HTML part.
export async function layout({
  heading,
  lines,
  button,
  reason,
}: {
  heading: string
  lines: string[]
  button?: { label: string; url: string }
  // Why the person is getting this email (shown in the footer).
  reason: string
}) {
  const s = await getSettings()
  const name = s.bizName || "Chrish Wedding Cars"
  const contact = [s.bizAddr, s.bizPhone].filter(Boolean)
  const text = [
    heading,
    "",
    ...lines.flatMap((l) => [l, ""]),
    ...(button ? [`${button.label}:`, button.url, ""] : []),
    "--",
    name,
    ...contact,
    "",
    reason,
  ].join("\n")
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:24px 16px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:15px;line-height:1.55">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#16120e">${esc(heading)}</p>
${lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("\n")}
${
  button
    ? `<p style="margin:22px 0"><a href="${esc(button.url)}" style="background:#16120e;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block">${esc(button.label)}</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#555555">If the button doesn't work, copy this address into your browser:<br><a href="${esc(button.url)}" style="color:#555555;word-break:break-all">${esc(button.url)}</a></p>`
    : ""
}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px">
<p style="margin:0;font-size:13px;color:#555555"><strong>${esc(name)}</strong>${contact.map((c) => `<br>${esc(c)}`).join("")}</p>
<p style="margin:10px 0 0;font-size:12px;color:#777777">${esc(reason)}</p>
</div></body></html>`
  return { text, html }
}
