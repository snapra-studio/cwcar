import { BrochureView } from "@/components/bridal/brochure-control"
import { adminPage } from "@/lib/server/guard"

export default async function Page() {
  await adminPage()
  return <BrochureView />
}
