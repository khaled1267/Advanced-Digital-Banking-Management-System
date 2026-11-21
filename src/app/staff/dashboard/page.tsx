import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function StaffDashboardPage() {
  await requireDashboardRole("STAFF");

  return <DashboardShell role="staff" />;
}
