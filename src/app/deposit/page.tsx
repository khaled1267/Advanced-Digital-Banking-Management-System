import { CustomerDepositPage } from "@/components/DepositPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerDepositRoute() {
  await requireDashboardRole("CUSTOMER");
  return (
    <DashboardShell role="customer">
      <CustomerDepositPage />
    </DashboardShell>
  );
}
