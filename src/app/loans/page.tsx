import { CustomerLoansPage } from "@/components/LoanPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerLoansRoute() {
  await requireDashboardRole("CUSTOMER");
  return (
    <DashboardShell role="customer">
      <CustomerLoansPage />
    </DashboardShell>
  );
}
