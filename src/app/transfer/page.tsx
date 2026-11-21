import { CustomerTransferPage } from "@/components/TransferPage";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerTransferRoute() {
  await requireDashboardRole("CUSTOMER");
  return (
    <DashboardShell role="customer">
      <CustomerTransferPage />
    </DashboardShell>
  );
}
