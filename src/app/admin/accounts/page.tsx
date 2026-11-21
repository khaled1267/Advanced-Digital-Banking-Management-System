import { AdminAccountsManager } from "@/components/AdminAccountsManager";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRoles } from "@/lib/authorization";

export default async function AdminAccountsPage() {
  const user = await requireDashboardRoles(["ADMIN", "STAFF"]);
  const role = user.role === "ADMIN" ? "admin" : "staff";

  return (
    <DashboardShell role={role}>
      <AdminAccountsManager canManageStatus={user.role === "ADMIN"} />
    </DashboardShell>
  );
}
