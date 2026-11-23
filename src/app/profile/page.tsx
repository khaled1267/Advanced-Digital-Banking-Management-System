import { CustomerProfilePage } from "@/components/CustomerProfilePage";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerProfileRoute() {
  await requireDashboardRole("CUSTOMER");

  return (
    <DashboardShell role="customer">
      <CustomerProfilePage />
    </DashboardShell>
  );
}
