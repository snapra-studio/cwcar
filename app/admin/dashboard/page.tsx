import { LandingView } from "@/components/bridal/landing-view"
import { adminPage } from "@/lib/server/guard"

export default async function Page() {
  await adminPage()
  return <LandingView />
}
