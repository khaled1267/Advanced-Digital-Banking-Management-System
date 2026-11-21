import { CustomerAccountsPanel } from "@/components/CustomerAccountsPanel";
import { DashboardShell } from "@/components/DashboardShell";
import { requireDashboardRole } from "@/lib/authorization";

export default async function CustomerAccountsPage() {
  await requireDashboardRole("CUSTOMER");

  return (
    <DashboardShell role="customer">
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mb-6"><p className="text-xs font-medium text-slate-500">Personal banking</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#142B4A]">My accounts</h1><p className="mt-1 text-sm text-slate-500">Your accounts and available balances.</p></div>
        <CustomerAccountsPanel />
      </div>
    </DashboardShell>
  );
}
