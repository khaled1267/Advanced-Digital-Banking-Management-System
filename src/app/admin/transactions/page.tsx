import { DashboardShell } from "@/components/DashboardShell";
import { TransactionHistory } from "@/components/TransactionHistory";
import { StaffPendingRequestQueue } from "@/components/StaffPendingRequestQueue";
import { requireDashboardRoles } from "@/lib/authorization";

export default async function AdminTransactionsPage() {
  const user = await requireDashboardRoles(["ADMIN", "STAFF"]);
  const role = user.role === "ADMIN" ? "admin" : "staff";
  return (
    <DashboardShell role={role}>
      <>
        <TransactionHistory mode="admin" canStaffReview={user.role === "STAFF"} />
        {user.role === "STAFF" && <StaffPendingRequestQueue />}
      </>
    </DashboardShell>
  );
}
