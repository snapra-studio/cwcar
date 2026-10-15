import "server-only"

import { fmtDate, rs } from "@/lib/bridal/format"
import { layout, mailConfigured, sendMail } from "@/lib/server/mailer"
import { getInquiry, recordEmail, type InquiryView } from "@/lib/server/partners"

// Decision emails to the person who sent a partner inquiry (to the email in
// the inquiry). The result is saved on the inquiry (sent / failed + error)
// so the admin can see it and press "Send email again".

const fmtT = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}
const lkr = (n: number) => rs(n).replace(/^Rs\s?/, "LKR ")
const SIGN = ["Best regards,", "Chrish Rentals Team", "070 107 1777", "www.chrishrentals.com"]

async function approvalMail(i: InquiryView) {
  return {
    subject: "Chrish Rentals – Your Vehicle Hire Inquiry Has Been Approved",
    ...(await layout({
      heading: `Dear ${i.contactName},`,
      lines: [
        "Your vehicle hire inquiry has been approved by Chrish Rentals.",
        "Booking Details:",
        `Inquiry ID: ${i.id}`,
        `Vehicle: ${i.carName}`,
        `Hire Date: ${fmtDate(i.hireDate)}`,
        `Pickup Time: ${fmtT(i.pickupTime)}`,
        `Drop-off Time: ${fmtT(i.dropTime)}`,
        `Total Hire Amount: ${lkr(i.total)}`,
        `Your Commission: ${lkr(i.commission)}`,
        `Net Payable to Chrish Rentals: ${lkr(i.net)}`,
        "Your vehicle reservation is now confirmed.",
        "Thank you for choosing Chrish Rentals.",
        SIGN.join("\n"),
      ],
      reason: `You received this because ${i.company} sent hire inquiry ${i.id} to Chrish Rentals using this email address.`,
    })),
  }
}

async function rejectionMail(i: InquiryView) {
  return {
    subject: "Chrish Rentals – Vehicle Hire Inquiry Update",
    ...(await layout({
      heading: `Dear ${i.contactName},`,
      lines: [
        "Thank you for your inquiry with Chrish Rentals.",
        "Unfortunately, we are unable to approve your vehicle hire inquiry at this time.",
        `Inquiry ID: ${i.id}`,
        `Vehicle: ${i.carName}`,
        `Requested Date: ${fmtDate(i.hireDate)}`,
        `Reason: ${i.rejectionReason || "Not specified"}`,
        "You are welcome to submit another inquiry for a different vehicle, date or time.",
        "Thank you for your understanding.",
        SIGN.join("\n"),
      ],
      reason: `You received this because ${i.company} sent hire inquiry ${i.id} to Chrish Rentals using this email address.`,
    })),
  }
}

// Sends the approval or rejection email for a decided inquiry and records
// the outcome. Returns true if it was sent.
export async function sendDecisionEmail(id: string): Promise<boolean> {
  const i = await getInquiry(id)
  if (!i || i.status === "pending") return false
  if (!mailConfigured()) {
    await recordEmail(id, false, "Email (SMTP) isn't set up.")
    return false
  }
  const mail = i.status === "approved" ? await approvalMail(i) : await rejectionMail(i)
  const ok = await sendMail({ to: i.email, ...mail })
  await recordEmail(id, ok, ok ? "" : "The mail server refused or couldn't be reached.")
  return ok
}
