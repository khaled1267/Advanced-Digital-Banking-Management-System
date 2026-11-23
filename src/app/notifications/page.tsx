import { DashboardShell } from "@/components/DashboardShell";
import { NotificationCenter } from "@/components/NotificationCenter";
import { requireDashboardRole } from "@/lib/authorization";

export default async function NotificationsPage() {
  await requireDashboardRole("CUSTOMER");
  return <DashboardShell role="customer"><NotificationCenter /></DashboardShell>;
}
