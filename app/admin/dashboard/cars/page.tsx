import { FleetView } from "@/components/bridal/fleet-view"
import { adminPage } from "@/lib/server/guard"

export default async function Page() {
  await adminPage()
  return <FleetView />
}
