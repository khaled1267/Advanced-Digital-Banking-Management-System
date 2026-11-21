import { CustomerWithdrawalPage } from "@/components/WithdrawalPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerWithdrawalRoute() {
  await requireDashboardRole("CUSTOMER");
  return (
    <DashboardShell role="customer">
      <CustomerWithdrawalPage />
    </DashboardShell>
  );
}
