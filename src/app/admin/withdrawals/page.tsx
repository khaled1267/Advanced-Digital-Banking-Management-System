import { AdminWithdrawalManagement } from "@/components/WithdrawalPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRoles } from "@/lib/authorization";

export default async function AdminWithdrawalsRoute() {
  const user = await requireDashboardRoles(["ADMIN", "STAFF"]);
  return (
    <DashboardShell role={user.role === "ADMIN" ? "admin" : "staff"}>
      <AdminWithdrawalManagement />
    </DashboardShell>
  );
}
