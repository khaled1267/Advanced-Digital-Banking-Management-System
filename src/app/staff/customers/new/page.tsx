import { DashboardShell } from "@/components/DashboardShell";
import { StaffCustomerRegistration } from "@/components/StaffCustomerRegistration";
import { requireDashboardRole } from "@/lib/authorization";

export default async function StaffCustomerRegistrationPage() {
  await requireDashboardRole("STAFF");
  return <DashboardShell role="staff"><StaffCustomerRegistration/></DashboardShell>;
}
