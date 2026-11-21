import { AdminDepositManagement } from "@/components/DepositPages";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRoles } from "@/lib/authorization";

export default async function AdminDepositsRoute() {
  const user = await requireDashboardRoles(["ADMIN", "STAFF"]);
  return (
    <DashboardShell role={user.role === "ADMIN" ? "admin" : "staff"}>
      <AdminDepositManagement />
    </DashboardShell>
  );
}
