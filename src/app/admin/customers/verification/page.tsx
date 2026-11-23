import { CustomerVerificationManager } from "@/components/CustomerVerificationManager";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function AdminCustomerVerificationPage() {
  await requireDashboardRole("ADMIN");
  return <DashboardShell role="admin"><CustomerVerificationManager/></DashboardShell>;
}
