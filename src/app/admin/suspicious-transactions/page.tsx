import { DashboardShell } from "@/components/DashboardShell";
import { SuspiciousTransactionQueue } from "@/components/SuspiciousTransactionQueue";
import { requireDashboardRole } from "@/lib/authorization";

export default async function AdminSuspiciousTransactionsPage() {
  await requireDashboardRole("ADMIN");
  return <DashboardShell role="admin"><SuspiciousTransactionQueue/></DashboardShell>;
}
