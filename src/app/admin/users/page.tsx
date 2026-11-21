import { DashboardShell } from "@/components/DashboardShell";
import { AdminUsersManager } from "@/components/AdminUsersManager";
import { requireDashboardRole } from "@/lib/authorization";

export default async function AdminUsersPage() {
  await requireDashboardRole("ADMIN");

  return (
    <DashboardShell role="admin">
      <AdminUsersManager />
    </DashboardShell>
  );
}
