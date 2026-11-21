import { DashboardShell } from "@/components/DashboardShell";
import { TransactionHistory } from "@/components/TransactionHistory";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerTransactionsPage() {
  await requireDashboardRole("CUSTOMER");
  return (
    <DashboardShell role="customer">
      <TransactionHistory mode="customer" />
    </DashboardShell>
  );
}
