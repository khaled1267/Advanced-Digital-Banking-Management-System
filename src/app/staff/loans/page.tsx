import { StaffLoansPage } from "@/components/LoanPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function StaffLoansRoute() {
  await requireDashboardRole("STAFF");
  return (
    <DashboardShell role="staff">
      <StaffLoansPage />
    </DashboardShell>
  );
}
