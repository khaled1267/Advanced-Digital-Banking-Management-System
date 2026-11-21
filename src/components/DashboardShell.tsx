"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { DashboardOverview } from "@/components/DashboardOverview";
import { useCurrentUserQuery, useLogoutMutation } from "@/store/authApi";
import { baseApi } from "@/store/api";
import type { AppDispatch } from "@/store/store";

export type DashboardRole = "admin" | "staff" | "customer";
type NavItem = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  href?: string;
};

const roleContent: Record<DashboardRole, { workspace: string; title: string; nav: NavItem[] }> = {
  admin: {
    workspace: "Administration",
    title: "Admin dashboard",
    nav: [
      { label: "Overview", icon: LayoutDashboard, href: "/admin/dashboard" },
      { label: "Users", icon: Users, href: "/admin/users" },
      { label: "Accounts", icon: Building2, href: "/admin/accounts" },
      { label: "Transactions", icon: Activity, href: "/admin/transactions" },
      { label: "Deposit Management", icon: ArrowDownLeft, href: "/admin/deposits" },
      { label: "Withdrawal Management", icon: ArrowUpRight, href: "/admin/withdrawals" },
      { label: "Transfers", icon: ArrowLeftRight },
      { label: "Loans", icon: HandCoins },
      { label: "Reports", icon: FileBarChart },
      { label: "Audit Logs", icon: ClipboardList },
      { label: "Settings", icon: Settings },
    ],
  },
  staff: {
    workspace: "Branch staff",
    title: "Staff dashboard",
    nav: [
      { label: "Overview", icon: LayoutDashboard, href: "/staff/dashboard" },
      { label: "Customers", icon: Users },
      { label: "Accounts", icon: Building2, href: "/admin/accounts" },
      { label: "Transactions", icon: Activity, href: "/admin/transactions" },
      { label: "Deposit Management", icon: ArrowDownLeft, href: "/admin/deposits" },
      { label: "Withdrawal Management", icon: ArrowUpRight, href: "/admin/withdrawals" },
      { label: "Loan Assistance", icon: HandCoins },
      { label: "Settings", icon: Settings },
    ],
  },
  customer: {
    workspace: "Personal banking",
    title: "Your dashboard",
    nav: [
      { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
      { label: "My Accounts", icon: Wallet, href: "/accounts" },
      { label: "Transfer Money", icon: ArrowLeftRight, href: "/transfer" },
      { label: "Deposit", icon: ArrowDownLeft, href: "/deposit" },
      { label: "Withdrawal", icon: ArrowUpRight, href: "/withdrawal" },
      { label: "My Transactions", icon: Activity, href: "/transactions" },
      { label: "Statements", icon: FileText },
      { label: "My Loans", icon: HandCoins },
      { label: "Profile", icon: UserRound },
      { label: "Settings", icon: Settings },
    ],
  },
};

export function DashboardShell({ role, children }: { role: DashboardRole; children?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { data: sessionResponse } = useCurrentUserQuery();
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const content = roleContent[role];
  const sessionUser = sessionResponse?.data.user;
  const displayName = sessionUser?.name ?? "Bank user";
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const currentNavItem = content.nav.find((item) => item.href?.split("#")[0] === pathname);
  const pageTitle = pathname === "/admin/users"
    ? "User management"
    : pathname === "/admin/accounts"
      ? "Bank accounts"
      : pathname.startsWith("/accounts/")
        ? "Account details"
        : currentNavItem?.label ?? content.title;

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout().unwrap();
      dispatch(baseApi.util.resetApiState());
      router.replace("/login");
    } catch {
      setLogoutError("Could not log out. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fa] lg:flex">
      {mobileNavOpen && <button className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-slate-200 bg-white px-5 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-1">
          <Link href={content.nav[0].href!} className="flex items-center gap-3" aria-label="Northstar Bank overview">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#142B4A] text-white"><Building2 size={21} strokeWidth={2.1} /></span>
            <span className="text-[17px] font-bold tracking-tight text-[#142B4A]">northstar<span className="text-[#10B981]">.</span></span>
          </Link>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
        </div>

        <div className="mt-9 px-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{content.workspace}</div>
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto" aria-label={`${role} navigation`}>
          {content.nav.map((item) => {
            const Icon = item.icon;
            const active = item.href?.split("#")[0] === pathname && !item.href.includes("#");
            const classes = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${active ? "bg-[#142B4A] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`;

            return item.href ? (
              <Link key={item.label} href={item.href} className={classes} onClick={() => setMobileNavOpen(false)}>
                <Icon size={17} />{item.label}
              </Link>
            ) : (
              <div key={item.label} className={`${classes} cursor-not-allowed text-slate-400`} aria-disabled="true" title="This area is not available yet">
                <Icon size={17} /><span>{item.label}</span><span className="ml-auto text-[9px] font-medium text-slate-400">Soon</span>
              </div>
            );
          })}
        </nav>

        <div className="mt-4 rounded-2xl bg-[#F3F7F8] p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#142B4A] shadow-sm"><ShieldCheck size={17} /></div>
          <p className="mt-3 text-xs font-semibold text-slate-800">Protected workspace</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Your banking tools follow your account permissions.</p>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 px-1 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7edf4] text-xs font-semibold text-[#142B4A]">{initials}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{displayName}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{sessionUser?.email ?? content.workspace}</p></div>
          <button type="button" onClick={handleLogout} disabled={isLoggingOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50" aria-label="Log out" title="Log out"><LogOut size={16} /></button>
        </div>
        {logoutError && <p role="alert" className="mt-2 px-1 text-[11px] text-rose-700">{logoutError}</p>}
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation menu" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <div><p className="text-[11px] text-slate-500">Northstar Bank <span className="px-1 text-slate-300">/</span> {content.workspace}</p><p className="mt-0.5 text-xs font-semibold text-slate-800">{pageTitle}</p></div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4"><span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-800 sm:flex"><ShieldCheck size={12} /> Secure session</span><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7edf4] text-[11px] font-semibold text-[#142B4A] sm:hidden">{initials}</div><div className="hidden items-center gap-2.5 sm:flex"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7edf4] text-[11px] font-semibold text-[#142B4A]">{initials}</div><span className="max-w-36 truncate text-xs font-semibold text-slate-700">{displayName}</span></div></div>
        </header>

        {children ?? <DashboardOverview role={role} />}
      </main>
    </div>
  );
}
