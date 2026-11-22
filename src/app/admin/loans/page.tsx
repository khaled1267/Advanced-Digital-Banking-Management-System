import { AdminLoansPage } from "@/components/LoanPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function AdminLoansRoute() {
  await requireDashboardRole("ADMIN");
  return (
    <DashboardShell role="admin">
      <AdminLoansPage />
    </DashboardShell>
  );
}
