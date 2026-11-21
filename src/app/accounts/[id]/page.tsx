import { CustomerAccountDetails } from "@/components/CustomerAccountDetails";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

type PageProps = { params: Promise<{ id: string }> };

export default async function AccountDetailsPage({ params }: PageProps) {
  await requireDashboardRole("CUSTOMER");
  const { id } = await params;
  return (
    <DashboardShell role="customer">
      <CustomerAccountDetails accountId={id} />
    </DashboardShell>
  );
}
