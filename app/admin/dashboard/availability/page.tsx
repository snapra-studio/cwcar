import { AvailabilityView } from "@/components/bridal/availability-view"
import { adminPage } from "@/lib/server/guard"

export default async function Page() {
  await adminPage()
  return <AvailabilityView />
}
