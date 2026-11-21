import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerDashboardPage() {
  await requireDashboardRole("CUSTOMER");

  return <DashboardShell role="customer" />;
}
