"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ClipboardList,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  HandCoins,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CustomerAccountsPanel } from "@/components/CustomerAccountsPanel";
import { useGetAdminUsersQuery } from "@/store/adminUsersApi";
import { useGetAdminAccountsQuery, useGetMyAccountsQuery } from "@/store/bankAccountsApi";
import { useGetAdminTransactionsQuery } from "@/store/transactionsApi";
import type { DashboardRole } from "@/components/DashboardShell";

type Icon = ComponentType<{ size?: number }>;
type Stat = { label: string; value: string; note: string; icon: Icon; live?: boolean; loading?: boolean; error?: boolean; tone?: "emerald" | "blue" | "amber" | "violet" };
type Action = { label: string; description: string; icon: Icon; href?: string };

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const demoMonthlyActivity = months.map((month, index) => ({
  month,
  transactions: [82, 96, 91, 118, 107, 136, 124, 148, 139, 165, 152, 181][index],
  spend: [18400, 16200, 21900, 19600, 23500, 20800, 24700, 22200, 26900, 24400, 28700, 25800][index],
}));
const demoCashFlow = [
  { month: "Jan", deposits: 128000, withdrawals: 76000 },
  { month: "Feb", deposits: 146000, withdrawals: 83000 },
  { month: "Mar", deposits: 139000, withdrawals: 91000 },
  { month: "Apr", deposits: 168000, withdrawals: 97000 },
  { month: "May", deposits: 157000, withdrawals: 89000 },
  { month: "Jun", deposits: 191000, withdrawals: 112000 },
];

function decimalToPaisa(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return BigInt("0");
  return BigInt(match[1]) * BigInt("100") + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function paisaToLabel(value: bigint) {
  const whole = value / BigInt("100");
  const fraction = (value % BigInt("100")).toString().padStart(2, "0");
  return `BDT ${whole.toLocaleString("en-BD")}.${fraction}`;
}

function StatCard({ stat }: { stat: Stat }) {
  const Icon = stat.icon;
  const iconTone = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  }[stat.tone ?? "blue"];
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-5">
      <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-slate-500">{stat.label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}><Icon size={17} /></span></div>
      <p className="mt-4 text-[26px] font-semibold tracking-tight text-[#142B4A]">{stat.loading ? <span className="inline-block h-8 w-20 animate-pulse rounded bg-slate-100" /> : stat.error ? "Unavailable" : stat.value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${stat.live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{stat.live ? "Live" : "Sample"}</span><span className="text-[10px] leading-4 text-slate-500">{stat.note}</span></div>
    </article>
  );
}

function ChartCard({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6 ${className}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#142B4A]">{title}</h2><p className="mt-1 text-[11px] text-slate-500">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Sample</span></div><div className="mt-5 h-[240px] w-full">{children}</div></section>;
}

function QuickActions({ actions }: { actions: Action[] }) {
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6"><div><h2 className="text-sm font-semibold text-[#142B4A]">Quick actions</h2><p className="mt-1 text-[11px] text-slate-500">Shortcuts available for your role</p></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{actions.map((action) => { const Icon = action.icon; const content = <><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#142B4A]"><Icon size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{action.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{action.description}</span></span>{action.href ? <ChevronRight size={15} className="text-slate-400" /> : <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-slate-400">Soon</span>}</>;
    return action.href ? <Link key={action.label} href={action.href} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40">{content}</Link> : <div key={action.label} aria-disabled="true" className="flex min-w-0 cursor-not-allowed items-center gap-3 rounded-xl border border-slate-100 p-3 opacity-75">{content}</div>;
  })}</div></section>;
}

function DemoTransactions({ heading = "Recent transactions", href }: { heading?: string; href: string }) {
  const rows = [
    { id: "DEMO-8421", title: "Salary credit", detail: "Sample transaction · 12 Dec", amount: "+ BDT 48,500.00", icon: ArrowDownLeft, positive: true },
    { id: "DEMO-8398", title: "Utility payment", detail: "Sample transaction · 10 Dec", amount: "− BDT 3,240.00", icon: CreditCard, positive: false },
    { id: "DEMO-8312", title: "Grocery purchase", detail: "Sample transaction · 08 Dec", amount: "− BDT 5,860.00", icon: CreditCard, positive: false },
  ];
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#142B4A]">{heading}</h2><p className="mt-1 text-[11px] text-slate-500">Illustrative preview only; open history for available transaction records.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Sample</span><Link href={href} className="text-[10px] font-semibold text-emerald-700">View history</Link></div></div><div className="mt-4 divide-y divide-slate-100">{rows.map((row) => { const Icon = row.icon; return <div key={row.id} className="flex items-center gap-3 py-3.5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}><Icon size={16}/></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{row.title}</p><p className="mt-1 truncate text-[10px] text-slate-500">{row.detail} · {row.id}</p></div><p className={`whitespace-nowrap text-[11px] font-semibold ${row.positive ? "text-emerald-700" : "text-slate-700"}`}>{row.amount}</p></div>; })}</div></section>;
}

function DemoActivity({ title, staff = false }: { title: string; staff?: boolean }) {
  const items = staff
    ? ["Sample customer registered", "Sample registration review", "Sample account information updated"]
    : ["Sample customer account opened", "Sample profile verification completed", "Sample user role updated"];
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#142B4A]">{title}</h2><p className="mt-1 text-[11px] text-slate-500">Illustrative activity only; no activity feed API exists yet.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Sample</span></div><div className="mt-4 space-y-4">{items.map((item, index) => <div key={item} className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{index === 0 ? <UserPlus size={15}/> : index === 1 ? <ShieldCheck size={15}/> : <Clock3 size={15}/>}</span><div><p className="text-xs font-medium text-slate-800">{item}</p><p className="mt-1 text-[10px] text-slate-500">Sample entry · {index + 1}h ago</p></div></div>)}</div></section>;
}

function PageIntro({ role }: { role: DashboardRole }) {
  const intro = {
    admin: ["Administration overview", "Monitor user access and banking operations from one place."],
    staff: ["Branch operations", "Review account activity and customer service workload."],
    customer: ["Welcome back", "A clear view of your accounts and personal banking."],
  }[role];
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium text-slate-500">{intro[0]}</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#142B4A]">{role === "customer" ? "Your finances at a glance" : role === "staff" ? "Team workspace" : "Bank overview"}</h1><p className="mt-1 text-sm text-slate-500">{intro[1]}</p></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><Activity size={14} className="text-emerald-600"/>Updated from available account data</div></div>;
}

export function DashboardOverview({ role }: { role: DashboardRole }) {
  const customersQuery = useGetAdminUsersQuery({ role: "CUSTOMER", page: 1, limit: 1 }, { skip: role !== "admin" });
  const staffQuery = useGetAdminUsersQuery({ role: "STAFF", page: 1, limit: 1 }, { skip: role !== "admin" });
  const bankAccountsQuery = useGetAdminAccountsQuery({ page: 1, limit: 1 }, { skip: role === "customer" });
  const transactionsQuery = useGetAdminTransactionsQuery({ page: 1, limit: 1 }, { skip: role === "customer" });
  const myAccountsQuery = useGetMyAccountsQuery(undefined, { skip: role !== "customer" });
  const myAccounts = myAccountsQuery.data?.data.accounts ?? [];
  const totalPaisa = myAccounts.reduce((sum, account) => sum + decimalToPaisa(account.balance), BigInt("0"));
  const realCustomersCount = customersQuery.data?.data.total;
  const realStaffCount = staffQuery.data?.data.total;
  const realAccountsCount = bankAccountsQuery.data?.data.total;

  const stats: Stat[] = role === "admin" ? [
    { label: "Total customers", value: String(realCustomersCount ?? 0), note: "Registered customer accounts", icon: Users, live: true, loading: customersQuery.isLoading, error: customersQuery.isError, tone: "blue" },
    { label: "Total staff", value: String(realStaffCount ?? 0), note: "Staff user accounts", icon: ShieldCheck, live: true, loading: staffQuery.isLoading, error: staffQuery.isError, tone: "violet" },
    { label: "Bank accounts", value: String(realAccountsCount ?? 0), note: "Accounts on record", icon: Building2, live: true, loading: bankAccountsQuery.isLoading, error: bankAccountsQuery.isError, tone: "emerald" },
    { label: "Total transactions", value: String(transactionsQuery.data?.data.summary.total ?? 0), note: "Transactions on record", icon: Activity, live: true, loading: transactionsQuery.isLoading, error: transactionsQuery.isError, tone: "blue" },
    { label: "Deposits", value: "BDT 8.42M", note: "Illustrative monthly total", icon: ArrowDownLeft, tone: "emerald" },
    { label: "Withdrawals", value: "BDT 5.16M", note: "Illustrative monthly total", icon: ArrowUpRight, tone: "amber" },
    { label: "Pending loan applications", value: "18", note: "Illustrative queue size", icon: HandCoins, tone: "violet" },
  ] : role === "staff" ? [
    { label: "Registered customers", value: "1,284", note: "Sample count · customer count API unavailable", icon: Users, tone: "blue" },
    { label: "Total accounts", value: String(realAccountsCount ?? 0), note: "Accounts on record", icon: Building2, live: true, loading: bankAccountsQuery.isLoading, error: bankAccountsQuery.isError, tone: "emerald" },
    { label: "Pending deposits", value: "12", note: "Sample request queue", icon: ArrowDownLeft, tone: "amber" },
    { label: "Pending withdrawals", value: "7", note: "Sample request queue", icon: ArrowUpRight, tone: "amber" },
    { label: "Pending transaction reviews", value: String(transactionsQuery.data?.data.summary.pending ?? 0), note: "Pending transactions on record", icon: ClipboardList, live: true, loading: transactionsQuery.isLoading, error: transactionsQuery.isError, tone: "violet" },
  ] : [
    { label: "Total balance", value: paisaToLabel(totalPaisa), note: "Combined balance across your accounts", icon: Wallet, live: true, loading: myAccountsQuery.isLoading, error: myAccountsQuery.isError, tone: "emerald" },
    { label: "My accounts", value: String(myAccounts.length), note: "Accounts linked to your profile", icon: Building2, live: true, loading: myAccountsQuery.isLoading, error: myAccountsQuery.isError, tone: "blue" },
    { label: "Deposit summary", value: "BDT 48,500", note: "Sample monthly deposits · no deposit API", icon: ArrowDownLeft, tone: "emerald" },
    { label: "Withdrawal summary", value: "BDT 12,340", note: "Sample monthly withdrawals · no withdrawal API", icon: ArrowUpRight, tone: "amber" },
  ];

  const quickActions: Action[] = role === "admin" ? [
    { label: "Manage users", description: "Review roles and access", icon: Users, href: "/admin/users" },
    { label: "Open an account", description: "Create a customer account", icon: CreditCard, href: "/admin/accounts" },
    { label: "Review transactions", description: "View transaction history", icon: Activity, href: "/admin/transactions" },
    { label: "View reports", description: "Reporting page not available", icon: FileText },
  ] : role === "staff" ? [
    { label: "Open an account", description: "Create a customer account", icon: CreditCard, href: "/admin/accounts" },
    { label: "Review customers", description: "Customer workspace not available", icon: Users },
    { label: "Deposit requests", description: "Deposit service not available", icon: ArrowDownLeft },
    { label: "Loan assistance", description: "Loan service not available", icon: HandCoins },
  ] : [
    { label: "View accounts", description: "Review your account balances", icon: Wallet, href: "/accounts" },
    { label: "Transfer money", description: "Transfer service not available", icon: ArrowLeftRight },
    { label: "Request deposit", description: "Deposit service not available", icon: ArrowDownLeft },
    { label: "Request withdrawal", description: "Withdrawal service not available", icon: ArrowUpRight },
    { label: "Apply for a loan", description: "Loan service not available", icon: HandCoins },
    { label: "View statements", description: "Statement service not available", icon: FileText },
  ];

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <PageIntro role={role}/>
      {role === "customer" && <div className="mb-5"><CustomerAccountsPanel/></div>}

      <section className={`grid gap-4 sm:grid-cols-2 ${role === "admin" ? "xl:grid-cols-4" : role === "staff" ? "xl:grid-cols-5" : "xl:grid-cols-4"}`} aria-label="Dashboard summary">
        {stats.map((stat) => <StatCard key={stat.label} stat={stat}/>) }
      </section>

      {role === "admin" && <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]"><ChartCard title="Monthly transaction activity" subtitle="Transaction volume across the year · sample data"><ResponsiveContainer width="100%" height="100%"><AreaChart data={demoMonthlyActivity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="transactionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1f5" strokeDasharray="3 3"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}/><Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 11 }}/><Area type="monotone" dataKey="transactions" name="Transactions" stroke="#10B981" strokeWidth={2.5} fill="url(#transactionFill)"/></AreaChart></ResponsiveContainer></ChartCard><ChartCard title="Deposits vs withdrawals" subtitle="Monthly cash flow comparison · sample BDT"><ResponsiveContainer width="100%" height="100%"><BarChart data={demoCashFlow} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf1f5" strokeDasharray="3 3"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value: number) => `${value / 1000}k`}/><Tooltip formatter={(value) => [`BDT ${Number(value).toLocaleString("en-BD")}`, ""]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 11 }}/><Bar dataKey="deposits" name="Deposits" fill="#10B981" radius={[4, 4, 0, 0]}/><Bar dataKey="withdrawals" name="Withdrawals" fill="#142B4A" radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></ChartCard></div>}

      {role === "staff" && <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]"><ChartCard title="Transaction activity" subtitle="Monthly transaction reviews · sample data"><ResponsiveContainer width="100%" height="100%"><LineChart data={demoMonthlyActivity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf1f5" strokeDasharray="3 3"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}/><Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 11 }}/><Line type="monotone" dataKey="transactions" name="Transactions" stroke="#142B4A" strokeWidth={2.5} dot={{ r: 2.5, fill: "#10B981", strokeWidth: 0 }}/></LineChart></ResponsiveContainer></ChartCard><DemoActivity title="Recent customer registrations" staff/></div>}

      {role === "customer" && <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]"><ChartCard title="Monthly spending" subtitle="Illustrative spending trend · sample data"><ResponsiveContainer width="100%" height="100%"><AreaChart data={demoMonthlyActivity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#142B4A" stopOpacity={0.16}/><stop offset="95%" stopColor="#142B4A" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1f5" strokeDasharray="3 3"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value: number) => `${value / 1000}k`}/><Tooltip formatter={(value) => [`BDT ${Number(value).toLocaleString("en-BD")}`, "Sample spending"]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 11 }}/><Area type="monotone" dataKey="spend" name="Sample spending" stroke="#142B4A" strokeWidth={2.5} fill="url(#spendingFill)"/></AreaChart></ResponsiveContainer></ChartCard><QuickActions actions={quickActions}/></div>}

      {role === "admin" && <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr_1fr]"><DemoTransactions href="/admin/transactions"/><DemoActivity title="Recent customer activity"/><QuickActions actions={quickActions}/></div>}
      {role === "staff" && <div className="mt-5"><QuickActions actions={quickActions}/></div>}
      {role === "customer" && <div className="mt-5"><DemoTransactions heading="Recent transactions" href="/transactions"/></div>}

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-200/70 pt-4 text-[10px] text-slate-400"><span>Northstar Bank · Secure banking workspace</span><span>Sample values are marked; live figures come from your available account APIs.</span></footer>
    </div>
  );
}
