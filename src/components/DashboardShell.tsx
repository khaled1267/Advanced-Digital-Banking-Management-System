"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
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
  LoaderCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Moon,
  Sun,
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
type DashboardTheme = "dark" | "light";

function getThemeSnapshot(): DashboardTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerThemeSnapshot(): DashboardTheme {
  return "dark";
}

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onChange);
  };
}

const roleContent: Record<DashboardRole, { workspace: string; title: string; nav: NavItem[] }> = {
  admin: {
    workspace: "Administration",
    title: "Admin dashboard",
    nav: [
      { label: "Overview", icon: LayoutDashboard, href: "/admin/dashboard" },
      { label: "Users", icon: Users, href: "/admin/users" },
      { label: "Accounts", icon: Building2, href: "/admin/accounts" },
      { label: "Transactions", icon: Activity, href: "/admin/transactions" },
      { label: "Statements", icon: FileText, href: "/statements" },
      { label: "Deposit Management", icon: ArrowDownLeft, href: "/admin/deposits" },
      { label: "Withdrawal Management", icon: ArrowUpRight, href: "/admin/withdrawals" },
      { label: "Transfers", icon: ArrowLeftRight },
      { label: "Loans", icon: HandCoins, href: "/admin/loans" },
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
      { label: "Statements", icon: FileText, href: "/statements" },
      { label: "Deposit Management", icon: ArrowDownLeft, href: "/admin/deposits" },
      { label: "Withdrawal Management", icon: ArrowUpRight, href: "/admin/withdrawals" },
      { label: "Loan Assistance", icon: HandCoins, href: "/staff/loans" },
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
      { label: "Statements", icon: FileText, href: "/statements" },
      { label: "My Loans", icon: HandCoins, href: "/loans" },
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
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [logoutError, setLogoutError] = useState("");
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const previousPath = useRef(pathname);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavWasOpen = useRef(false);
  const content = roleContent[role];
  const sessionUser = sessionResponse?.data.user;
  const displayName = sessionUser?.name ?? "Bank user";
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  const currentNavItem = content.nav.find((item) => item.href?.split("#")[0] === pathname);
  const pageTitle = pathname === "/admin/users"
    ? "User management"
    : pathname === "/admin/accounts"
      ? "Bank accounts"
      : pathname === "/statements"
        ? "Account statements"
        : pathname.startsWith("/accounts/")
        ? "Account details"
        : currentNavItem?.label ?? content.title;

  useEffect(() => {
    if (!mobileNavOpen && !desktopSidebarOpen) return;
    function handleSidebarKeyboard(event: KeyboardEvent) {
      if (event.key === "Tab" && mobileNavOpen && !window.matchMedia("(min-width: 1024px)").matches) {
        const focusable = document.querySelectorAll<HTMLElement>(
          "#dashboard-sidebar a[href], #dashboard-sidebar button:not(:disabled)",
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (window.matchMedia("(min-width: 1024px)").matches) {
        if (desktopSidebarOpen) setDesktopSidebarOpen(false);
      } else if (mobileNavOpen) {
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", handleSidebarKeyboard);
    return () => window.removeEventListener("keydown", handleSidebarKeyboard);
  }, [mobileNavOpen, desktopSidebarOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      mobileCloseButtonRef.current?.focus();
    } else if (mobileNavWasOpen.current) {
      mobileMenuButtonRef.current?.focus();
    }
    mobileNavWasOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector<HTMLElement>(".dashboard-page-content");
    const transition = page?.animate(
      [{ opacity: 0.94, transform: "translate3d(0, 5px, 0)" }, { opacity: 1, transform: "translate3d(0, 0, 0)" }],
      { duration: 240, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
    return () => transition?.cancel();
  }, [pathname]);

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

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem("northstar-dashboard-theme", nextTheme);
    } catch {
      // The in-session theme still changes when storage is unavailable.
    }
  }

  return (
    <div className="dashboard-root min-h-screen bg-[#050610] lg:flex">
      <button className={`fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ease-out motion-reduce:transition-none lg:hidden ${mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-label="Close navigation" aria-hidden={!mobileNavOpen} tabIndex={mobileNavOpen ? 0 : -1} disabled={!mobileNavOpen} onClick={() => setMobileNavOpen(false)} />

      <aside
        id="dashboard-sidebar"
        aria-label={`${content.workspace} sidebar`}
        className={`dashboard-sidebar dashboard-sidebar-drawer fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-white/[0.07] bg-[#080916] px-4 py-5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${desktopSidebarOpen ? "" : "is-desktop-closed"} ${mobileNavOpen ? "is-mobile-open translate-x-0" : "is-mobile-closed -translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-1">
          <Link href={content.nav[0].href!} className="flex items-center gap-3" aria-label="Northstar ">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 text-white shadow-lg shadow-blue-950/40"><Building2 size={21} strokeWidth={2.1} /></span>
            <span className="dashboard-brand-name text-[17px] font-bold tracking-tight text-white">northstar<span className="text-cyan-300">.</span></span>
          </Link>
          <button ref={mobileCloseButtonRef} type="button" className="dashboard-interactive rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 lg:hidden" aria-label="Close menu" aria-controls="dashboard-sidebar" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
        </div>

        <div className="mt-9 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{content.workspace}</div>
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto" aria-label={`${role} navigation`}>
          {content.nav.map((item) => {
            const Icon = item.icon;
            const active = item.href?.split("#")[0] === pathname && !item.href.includes("#");
            const classes = `dashboard-shell-link dashboard-interactive relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-medium transition-all duration-200 ease-out before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:scale-y-50 before:rounded-full before:bg-[#0D17E7] before:opacity-0 before:shadow-[0_0_12px_rgba(13,23,231,0.35)] before:transition before:duration-200 before:content-[''] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${active ? "dashboard-nav-active before:scale-y-100 before:opacity-100" : "text-slate-400 hover:translate-x-0.5 hover:bg-white/[0.05] hover:text-slate-100"}`;

            return item.href ? (
              <Link key={item.label} href={item.href} className={classes} onClick={() => setMobileNavOpen(false)}>
                <Icon size={17} />{item.label}
              </Link>
            ) : (
              <div key={item.label} className={`${classes} cursor-not-allowed text-slate-600`} aria-disabled="true" title="This area is not available yet">
                <Icon size={17} /><span>{item.label}</span><span className="ml-auto text-[9px] font-medium text-slate-600">Soon</span>
              </div>
            );
          })}
        </nav>

        <div className="dashboard-protected-card mt-4 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#111b31] to-[#0d1425] p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-400/10 text-blue-300"><ShieldCheck size={17} /></div>
          <p className="mt-3 text-xs font-semibold text-slate-200">Protected workspace</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Your banking tools follow your account permissions.</p>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="dashboard-interactive mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-left text-xs font-semibold text-slate-200 transition hover:border-blue-300/30 hover:bg-blue-400/[0.06] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          <span className="flex-1">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>

        <div className="mt-5 flex items-center gap-3 border-t border-white/[0.07] px-1 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-400/15 text-xs font-semibold text-blue-200">{initials}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{displayName}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{sessionUser?.email ?? content.workspace}</p></div>
          <button type="button" onClick={handleLogout} disabled={isLoggingOut} className="dashboard-interactive rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50" aria-label={isLoggingOut ? "Logging out" : "Log out"} aria-busy={isLoggingOut} title={isLoggingOut ? "Logging out…" : "Log out"}>{isLoggingOut ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} /> : <LogOut size={16} />}</button>
        </div>
        {logoutError && <p role="alert" className="mt-2 px-1 text-[11px] text-rose-700">{logoutError}</p>}
      </aside>

      <main className="dashboard-shell min-w-0 flex-1">
        <header className="dashboard-header sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-white/[0.07] bg-[#050610]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button ref={mobileMenuButtonRef} type="button" className="dashboard-interactive rounded-lg p-2 text-slate-300 transition hover:bg-white/[0.06] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 lg:hidden" aria-label="Open navigation menu" aria-expanded={mobileNavOpen} aria-controls="dashboard-sidebar" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <div><p className="text-[11px] text-slate-500">Northstar Bank <span className="px-1 text-slate-700">/</span> {content.workspace}</p><p className="mt-0.5 text-xs font-semibold text-slate-200">{pageTitle}</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              className="dashboard-interactive hidden h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.06] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 lg:inline-flex"
              aria-label={desktopSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={desktopSidebarOpen}
              aria-controls="dashboard-sidebar"
              title={desktopSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              onClick={() => setDesktopSidebarOpen((open) => !open)}
            >
              {desktopSidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </button>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-medium text-emerald-200 sm:flex"><ShieldCheck size={12} /> Secure session</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-400/15 text-[11px] font-semibold text-blue-200 sm:hidden">{initials}</div><div className="hidden items-center gap-2.5 sm:flex"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-400/15 text-[11px] font-semibold text-blue-200">{initials}</div><span className="max-w-36 truncate text-xs font-semibold text-slate-300">{displayName}</span></div>
          </div>
        </header>

        <div className="dashboard-page-content dashboard-route-enter">{children ?? <DashboardOverview role={role} />}</div>
      </main>
    </div>
  );
}
