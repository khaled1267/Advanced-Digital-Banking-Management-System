import { CustomerVerificationManager } from "@/components/CustomerVerificationManager";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function StaffCustomerVerificationPage() {
  await requireDashboardRole("STAFF");
  return <DashboardShell role="staff"><CustomerVerificationManager/></DashboardShell>;
}
