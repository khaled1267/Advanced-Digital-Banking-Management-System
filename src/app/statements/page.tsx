import { AccountStatementPage } from "@/components/AccountStatementPage";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRoles } from "@/lib/authorization";

export default async function StatementsPage() {
  const user = await requireDashboardRoles(["CUSTOMER", "ADMIN", "STAFF"]);
  const role = user.role === "CUSTOMER" ? "customer" : user.role === "ADMIN" ? "admin" : "staff";

  return (
    <DashboardShell role={role}>
      <AccountStatementPage role={role} />
    </DashboardShell>
  );
}
