import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function AdminDashboardPage() {
  await requireDashboardRole("ADMIN");

  return <DashboardShell role="admin" />;
}
