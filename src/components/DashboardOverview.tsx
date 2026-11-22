"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  HandCoins,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CustomerAccountsPanel } from "@/components/CustomerAccountsPanel";
import type { DashboardRole } from "@/components/DashboardShell";
import { useGetAdminUsersQuery } from "@/store/adminUsersApi";
import { useGetAdminAccountsQuery, useGetMyAccountsQuery } from "@/store/bankAccountsApi";
import { useGetAdminDepositsQuery, useGetMyDepositsQuery } from "@/store/depositsApi";
import { useGetAdminWithdrawalsQuery, useGetMyWithdrawalsQuery } from "@/store/withdrawalsApi";
import { useGetAdminTransactionsQuery, useGetMyTransactionsQuery, type TransactionRecord } from "@/store/transactionsApi";
import { useGetAdminLoansQuery, useGetMyLoanSummaryQuery, useGetStaffLoansQuery } from "@/store/loansApi";

type Icon = ComponentType<{ size?: number; className?: string }>;
type Metric = { label: string; value: string; detail: string; icon: Icon; error?: boolean; loading?: boolean; animationTarget?: bigint; animationFormat?: "money" | "integer"; accent?: "blue" | "cyan" | "violet" | "amber" };
type LinkAction = { label: string; description: string; icon: Icon; href: string };
type ActivityPoint = { day: string; incoming: number; outgoing: number };

const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const sevenDaysFromNow = new Date().toISOString().slice(0, 10);

function toPaisa(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return BigInt("0");
  return BigInt(match[1]) * BigInt("100") + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function money(value: bigint) {
  return `BDT ${(value / BigInt("100")).toLocaleString("en-BD")}.${(value % BigInt("100")).toString().padStart(2, "0")}`;
}

function formatMetricValue(value: bigint, format: "money" | "integer") {
  return format === "money" ? money(value) : value.toLocaleString("en-BD");
}

function AnimatedMetricValue({ target, format }: { target: bigint; format: "money" | "integer" }) {
  const [value, setValue] = useState(BigInt("0"));
  const renderedValue = useRef(BigInt("0"));

  useEffect(() => {
    const finalValue = target < BigInt("0") ? BigInt("0") : target;
    const startValue = renderedValue.current;
    const change = finalValue - startValue;
    const updateValue = (nextValue: bigint) => {
      renderedValue.current = nextValue;
      setValue(nextValue);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || finalValue === BigInt("0")) {
      updateValue(finalValue);
      return;
    }

    const duration = 680;
    const startedAt = performance.now();
    let frame = 0;
    function tick(now: number) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const fraction = BigInt(Math.floor(progress * 10000));
      updateValue(startValue + (change * fraction) / BigInt("10000"));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const finalLabel = formatMetricValue(target, format);
  return <span aria-label={finalLabel} title={finalLabel}>{formatMetricValue(value, format)}</span>;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function activityFromTransactions(transactions: TransactionRecord[], role: DashboardRole, ownAccountIds: Set<string>): ActivityPoint[] {
  const points = new Map<string, ActivityPoint>();
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - dayOffset);
    const key = date.toISOString().slice(0, 10);
    points.set(key, { day: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date), incoming: 0, outgoing: 0 });
  }

  for (const transaction of transactions) {
    if (transaction.status !== "COMPLETED") continue;
    const key = transaction.createdAt.slice(0, 10);
    const point = points.get(key);
    if (!point) continue;
    const amount = Number(toPaisa(transaction.amount)) / 100;
    if (role === "admin" || role === "staff") {
      if (transaction.transactionType === "DEPOSIT" || transaction.transactionType === "LOAN_DISBURSEMENT") point.incoming += amount;
      if (transaction.transactionType === "WITHDRAWAL" || transaction.transactionType === "LOAN_REPAYMENT") point.outgoing += amount;
      continue;
    }
    if (transaction.transactionType === "DEPOSIT" || transaction.transactionType === "LOAN_DISBURSEMENT") point.incoming += amount;
    else if (transaction.transactionType === "WITHDRAWAL" || transaction.transactionType === "LOAN_REPAYMENT") point.outgoing += amount;
    else if (transaction.transactionType === "TRANSFER") {
      if (transaction.toAccount && ownAccountIds.has(transaction.toAccount.id)) point.incoming += amount;
      else if (transaction.fromAccount && ownAccountIds.has(transaction.fromAccount.id)) point.outgoing += amount;
    }
  }
  return [...points.values()];
}

function MetricCard({ metric, featured = false, delay = 0 }: { metric: Metric; featured?: boolean; delay?: number }) {
  const Icon = metric.icon;
  const value = metric.loading
    ? <span className="dashboard-skeleton inline-block h-8 w-28 rounded-lg bg-white/[0.06]" aria-label="Loading" />
    : metric.error ? "Unavailable" : metric.animationTarget !== undefined && metric.animationFormat
      ? <AnimatedMetricValue target={metric.animationTarget} format={metric.animationFormat}/>
      : metric.value;
  return <article style={{ "--dashboard-delay": `${delay}ms` } as CSSProperties} className={`dashboard-reveal dashboard-card-hover relative overflow-hidden rounded-2xl border p-5 ${featured ? "dashboard-featured border-[#646BA2]/30 bg-gradient-to-br from-[#131C58] via-[#1B268E] to-[#111638] shadow-[0_18px_45px_rgba(19,28,88,0.24)]" : "border-white/[0.07] bg-[#10182b] shadow-[0_12px_35px_rgba(0,0,0,0.12)]"}`}>
    {featured && <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full border border-white/10 bg-white/[0.04]" />}
    <div className="relative flex items-start justify-between gap-3"><p className={`text-xs font-medium ${featured ? "text-blue-100/80" : "text-slate-400"}`}>{metric.label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${featured ? "bg-white/10 text-white" : "bg-blue-400/10 text-blue-300"}`}><Icon size={17}/></span></div>
    <p className={`relative mt-5 break-words text-[25px] font-semibold tracking-tight ${featured ? "text-white" : metric.error ? "text-amber-200" : "text-slate-100"}`}>{value}</p>
    <p className={`relative mt-2 text-[10px] leading-4 ${featured ? "text-blue-100/70" : "text-slate-500"}`}>{metric.error ? "This figure could not be loaded." : metric.detail}</p>
  </article>;
}

function Panel({ title, detail, href, children, className = "" }: { title: string; detail: string; href?: string; children: ReactNode; className?: string }) {
  return <section className={`dashboard-reveal dashboard-card-hover rounded-2xl border border-white/[0.07] bg-[#10182b] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.12)] sm:p-6 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-100">{title}</h2><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div>{href && <Link href={href} className="dashboard-interactive inline-flex items-center gap-1 rounded text-[10px] font-semibold text-blue-300 transition hover:text-blue-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">View all <ChevronRight size={13}/></Link>}</div>
    {children}
  </section>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-xs text-slate-400">{children}</div>;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return prefersReducedMotion;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="dashboard-content-enter mt-5 rounded-xl border border-rose-300/15 bg-rose-400/[0.06] px-4 py-4 text-xs text-rose-200">Could not load this information. <button type="button" onClick={onRetry} className="dashboard-interactive ml-1 rounded font-semibold text-white underline underline-offset-2 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Try again</button></div>;
}

function QuickActions({ actions }: { actions: LinkAction[] }) {
  return <Panel title="Quick actions" detail="Shortcuts available to your role">
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{actions.map(({ label, description, icon: Icon, href }) => <Link key={label} href={href} className="dashboard-interactive group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-blue-300/25 hover:bg-blue-400/[0.06] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-300"><Icon size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{description}</span></span><ChevronRight size={15} className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-blue-300"/>
    </Link>)}</div>
  </Panel>;
}

function RecentTransactions({ transactions, loading, error, onRetry, href, ownAccountIds, role }: {
  transactions: TransactionRecord[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  href: string;
  ownAccountIds: Set<string>;
  role: DashboardRole;
}) {
  return <Panel title="Recent transactions" detail="Latest completed and pending account activity" href={href}>
    {loading ? <div className="mt-5 space-y-3" role="status" aria-label="Loading transactions">{[0, 1, 2].map((key) => <div key={key} className="dashboard-skeleton h-14 rounded-xl bg-white/[0.04]" />)}</div>
      : error ? <LoadError onRetry={onRetry}/>
        : transactions.length ? <div className="dashboard-content-enter mt-4 overflow-x-auto rounded-xl border border-white/[0.06]"><table className="w-full min-w-[570px] text-left"><caption className="sr-only">Latest banking transactions</caption><thead className="bg-white/[0.025] text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500"><tr><th scope="col" className="px-4 py-3">Transaction</th><th scope="col" className="px-3 py-3">Account</th><th scope="col" className="px-3 py-3 text-right">Amount</th><th scope="col" className="px-4 py-3 text-right">Status</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{transactions.slice(0, 5).map((transaction, index) => {
          const outgoing = transaction.transactionType === "WITHDRAWAL" || transaction.transactionType === "LOAN_REPAYMENT" || (role === "customer" && transaction.transactionType === "TRANSFER" && Boolean(transaction.fromAccount && ownAccountIds.has(transaction.fromAccount.id)));
          const neutral = transaction.transactionType === "TRANSFER" && role !== "customer";
          const label = transaction.transactionType.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
          const account = role === "customer" && outgoing ? transaction.fromAccount : transaction.toAccount ?? transaction.fromAccount;
          return <tr key={transaction.id} style={{ "--dashboard-delay": `${index * 35}ms` } as CSSProperties} className="dashboard-row-enter transition-colors hover:bg-white/[0.035]"><td className="px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${outgoing ? "bg-indigo-400/10 text-indigo-200" : neutral ? "bg-white/[0.06] text-slate-300" : "bg-cyan-400/10 text-cyan-200"}`}>{neutral ? <ArrowLeftRight size={14}/> : outgoing ? <ArrowUpRight size={14}/> : <ArrowDownLeft size={14}/>}</span><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-slate-200">{label}</p><p className="mt-0.5 truncate font-mono text-[9px] text-slate-500">{transaction.transactionId} · {dateLabel(transaction.createdAt)}</p></div></div></td><td className="px-3 py-3 font-mono text-[10px] text-slate-400">{account?.maskedAccountNumber ?? "Unavailable"}</td><td className={`whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold ${outgoing ? "text-slate-200" : neutral ? "text-slate-300" : "text-cyan-200"}`}>{neutral ? "" : outgoing ? "− " : "+ "}BDT {transaction.amount}</td><td className="px-4 py-3 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-medium transition-colors ${transaction.status === "COMPLETED" ? "bg-emerald-300/[0.07] text-emerald-300" : transaction.status === "PENDING" ? "bg-amber-300/[0.07] text-amber-200" : "bg-rose-300/[0.07] text-rose-300"}`}>{transaction.status}</span></td></tr>;
        })}</tbody></table></div> : <EmptyState>No transactions recorded yet.</EmptyState>}
  </Panel>;
}

function ActivityChart({ data, loading, error, onRetry, role, total }: { data: ActivityPoint[]; loading: boolean; error: boolean; onRetry: () => void; role: DashboardRole; total: number }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const label = role === "customer" ? "Your completed cash flow" : "Completed deposit and withdrawal volume";
  return <Panel title="7-day activity" detail={`${label} · based on up to 100 recent transactions`}>
    {loading ? <div className="dashboard-skeleton mt-5 h-[230px] rounded-xl bg-white/[0.04]" role="status" aria-label="Loading activity chart"/> : error ? <LoadError onRetry={onRetry}/> : total === 0 ? <EmptyState>There is no completed transaction activity in the last 7 days.</EmptyState> : <div className="dashboard-content-enter mt-4 h-[235px] w-full" role="img" aria-label="Seven day account activity chart">
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs><linearGradient id="dashIncoming" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--dashboard-chart-primary)" stopOpacity={0.32}/><stop offset="95%" stopColor="var(--dashboard-chart-primary)" stopOpacity={0}/></linearGradient><linearGradient id="dashOutgoing" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--dashboard-chart-secondary)" stopOpacity={0.2}/><stop offset="95%" stopColor="var(--dashboard-chart-secondary)" stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)}/>
        <Tooltip wrapperStyle={{ transition: "opacity 150ms ease-out" }} contentStyle={{ borderRadius: 12, background: "var(--dashboard-tooltip-bg)", borderColor: "var(--dashboard-border-color)", color: "var(--dashboard-text)", fontSize: 11 }} formatter={(value) => [`BDT ${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`, ""]}/>
        <Area isAnimationActive={!prefersReducedMotion} animationDuration={700} animationEasing="ease-out" type="monotone" dataKey="incoming" name="Incoming" stroke="var(--dashboard-chart-primary)" strokeWidth={2} fill="url(#dashIncoming)"/><Area isAnimationActive={!prefersReducedMotion} animationDuration={700} animationEasing="ease-out" type="monotone" dataKey="outgoing" name="Outgoing" stroke="var(--dashboard-chart-secondary)" strokeWidth={2} fill="url(#dashOutgoing)"/>
      </AreaChart></ResponsiveContainer></div>}
  </Panel>;
}

function RequestStatusPanel({ title, detail, pending, approved, rejected, href, loading, error, onRetry }: {
  title: string; detail: string; pending?: number; approved?: number; rejected?: number; href: string; loading: boolean; error: boolean; onRetry: () => void;
}) {
  return <Panel title={title} detail={detail} href={href}>
    {loading ? <div role="status" className="dashboard-skeleton mt-4 h-20 rounded-xl bg-white/[0.04]"/> : error ? <LoadError onRetry={onRetry}/> : pending === undefined ? <EmptyState>No status data is available.</EmptyState> : <div className="dashboard-content-enter mt-4 grid grid-cols-3 gap-2">
      {[{ label: "Pending", value: pending, color: "text-amber-200" }, { label: "Approved", value: approved ?? 0, color: "text-emerald-200" }, { label: "Rejected", value: rejected ?? 0, color: "text-slate-300" }].map((item) => <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3"><p className="text-[10px] text-slate-500">{item.label}</p><p className={`mt-1 text-lg font-semibold ${item.color}`}>{item.value.toLocaleString()}</p></div>)}
    </div>}
  </Panel>;
}

function PageIntro({ role, name }: { role: DashboardRole; name?: string }) {
  const title = role === "customer" ? `Welcome${name ? `, ${name.split(" ")[0]}` : " back"}` : role === "staff" ? "Branch workspace" : "Bank overview";
  const detail = role === "customer" ? "A clear picture of your accounts and daily banking." : role === "staff" ? "Customer accounts and review queues available to your role." : "Banking activity and operational queues at a glance.";
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300">{role === "customer" ? "Personal banking" : role === "staff" ? "Branch operations" : "Administration"}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1><p className="mt-1.5 text-sm text-slate-400">{detail}</p></div><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-[10px] font-medium text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300"/>Secure live workspace</span></div>;
}

export function DashboardOverview({ role }: { role: DashboardRole }) {
  const isCustomer = role === "customer";
  const isAdmin = role === "admin";
  const customerAccounts = useGetMyAccountsQuery(undefined, { skip: !isCustomer });
  const managedAccounts = useGetAdminAccountsQuery({ page: 1, limit: role === "staff" ? 5 : 1 }, { skip: isCustomer });
  const customerTransactions = useGetMyTransactionsQuery({ page: 1, limit: 8, startDate: sevenDaysAgo, endDate: sevenDaysFromNow }, { skip: !isCustomer });
  const managedTransactions = useGetAdminTransactionsQuery({ page: 1, limit: 100, startDate: sevenDaysAgo, endDate: sevenDaysFromNow }, { skip: isCustomer });
  const customerDeposits = useGetMyDepositsQuery({ page: 1, limit: 5 }, { skip: !isCustomer });
  const managedDeposits = useGetAdminDepositsQuery({ page: 1, limit: 5 }, { skip: isCustomer });
  const customerWithdrawals = useGetMyWithdrawalsQuery({ page: 1, limit: 5 }, { skip: !isCustomer });
  const managedWithdrawals = useGetAdminWithdrawalsQuery({ page: 1, limit: 5 }, { skip: isCustomer });
  const customerLoans = useGetMyLoanSummaryQuery(undefined, { skip: !isCustomer });
  const staffLoans = useGetStaffLoansQuery({ status: "PENDING", page: 1, limit: 1 }, { skip: role !== "staff" });
  const adminPendingLoans = useGetAdminLoansQuery({ status: "FORWARDED_TO_ADMIN", page: 1, limit: 1 }, { skip: !isAdmin });
  const adminDisbursedLoans = useGetAdminLoansQuery({ status: "DISBURSED", page: 1, limit: 5 }, { skip: !isAdmin });
  const customers = useGetAdminUsersQuery({ role: "CUSTOMER", page: 1, limit: 1 }, { skip: !isAdmin });

  const accounts = customerAccounts.data?.data.accounts ?? [];
  const transactions = isCustomer ? customerTransactions.data?.data.transactions ?? [] : managedTransactions.data?.data.transactions ?? [];
  const transactionQuery = isCustomer ? customerTransactions : managedTransactions;
  const depositData = isCustomer ? customerDeposits.data?.data : managedDeposits.data?.data;
  const depositQuery = isCustomer ? customerDeposits : managedDeposits;
  const withdrawalData = isCustomer ? customerWithdrawals.data?.data : managedWithdrawals.data?.data;
  const withdrawalQuery = isCustomer ? customerWithdrawals : managedWithdrawals;
  const ownAccountIds = new Set(accounts.map((account) => account.id));
  const activity = activityFromTransactions(transactions, role, ownAccountIds);
  const transactionCount = activity.reduce((sum, point) => sum + point.incoming + point.outgoing, 0);
  const totalBalance = accounts.reduce((sum, account) => sum + toPaisa(account.balance), BigInt("0"));

  const customerMetrics: Metric[] = [
    { label: "Total balance", value: money(totalBalance), animationTarget: totalBalance, animationFormat: "money", detail: "Combined balance across your accounts", icon: Wallet, loading: customerAccounts.isLoading, error: customerAccounts.isError, accent: "blue" },
    { label: "My accounts", value: String(accounts.length), animationTarget: BigInt(accounts.length), animationFormat: "integer", detail: "Accounts linked to your profile", icon: Building2, loading: customerAccounts.isLoading, error: customerAccounts.isError, accent: "cyan" },
    { label: "Pending deposits", value: String(depositData?.summary.pending ?? 0), animationTarget: BigInt(depositData?.summary.pending ?? 0), animationFormat: "integer", detail: "Your deposit requests awaiting review", icon: ArrowDownLeft, loading: depositQuery.isLoading, error: depositQuery.isError, accent: "violet" },
    { label: "Pending withdrawals", value: String(withdrawalData?.summary.pending ?? 0), animationTarget: BigInt(withdrawalData?.summary.pending ?? 0), animationFormat: "integer", detail: "Your withdrawal requests awaiting review", icon: ArrowUpRight, loading: withdrawalQuery.isLoading, error: withdrawalQuery.isError, accent: "amber" },
    { label: "Loan outstanding", value: customerLoans.data ? money(toPaisa(customerLoans.data.data.outstandingBalance)) : "—", animationTarget: BigInt(customerLoans.data ? toPaisa(customerLoans.data.data.outstandingBalance).toString() : "0"), animationFormat: "money", detail: `${customerLoans.data?.data.disbursedLoans ?? 0} active disbursed loans`, icon: HandCoins, loading: customerLoans.isLoading, error: customerLoans.isError, accent: "blue" },
  ];
  const adminMetrics: Metric[] = [
    { label: "Customers", value: String(customers.data?.data.total ?? 0), animationTarget: BigInt(customers.data?.data.total ?? 0), animationFormat: "integer", detail: "Registered customer profiles", icon: Users, loading: customers.isLoading, error: customers.isError, accent: "blue" },
    { label: "Bank accounts", value: String(managedAccounts.data?.data.total ?? 0), animationTarget: BigInt(managedAccounts.data?.data.total ?? 0), animationFormat: "integer", detail: "Accounts on record", icon: Building2, loading: managedAccounts.isLoading, error: managedAccounts.isError, accent: "cyan" },
    { label: "Deposit requests", value: String(managedDeposits.data?.data.summary.total ?? 0), animationTarget: BigInt(managedDeposits.data?.data.summary.total ?? 0), animationFormat: "integer", detail: `${managedDeposits.data?.data.summary.pending ?? 0} pending · request count`, icon: ArrowDownLeft, loading: managedDeposits.isLoading, error: managedDeposits.isError, accent: "violet" },
    { label: "Withdrawal requests", value: String(managedWithdrawals.data?.data.summary.total ?? 0), animationTarget: BigInt(managedWithdrawals.data?.data.summary.total ?? 0), animationFormat: "integer", detail: `${managedWithdrawals.data?.data.summary.pending ?? 0} pending · request count`, icon: ArrowUpRight, loading: managedWithdrawals.isLoading, error: managedWithdrawals.isError, accent: "amber" },
    { label: "Transactions (7 days)", value: String(managedTransactions.data?.data.summary.total ?? 0), animationTarget: BigInt(managedTransactions.data?.data.summary.total ?? 0), animationFormat: "integer", detail: "Recent bank-wide transaction records", icon: Activity, loading: managedTransactions.isLoading, error: managedTransactions.isError, accent: "blue" },
    { label: "Awaiting Admin", value: String(adminPendingLoans.data?.data.total ?? 0), animationTarget: BigInt(adminPendingLoans.data?.data.total ?? 0), animationFormat: "integer", detail: "Loan applications forwarded for decision", icon: HandCoins, loading: adminPendingLoans.isLoading, error: adminPendingLoans.isError, accent: "violet" },
  ];
  const staffMetrics: Metric[] = [
    { label: "Customer accounts", value: String(managedAccounts.data?.data.total ?? 0), animationTarget: BigInt(managedAccounts.data?.data.total ?? 0), animationFormat: "integer", detail: "Customer accounts on record", icon: Building2, loading: managedAccounts.isLoading, error: managedAccounts.isError, accent: "blue" },
    { label: "Pending deposits", value: String(managedDeposits.data?.data.summary.pending ?? 0), animationTarget: BigInt(managedDeposits.data?.data.summary.pending ?? 0), animationFormat: "integer", detail: "Requests awaiting review", icon: ArrowDownLeft, loading: managedDeposits.isLoading, error: managedDeposits.isError, accent: "cyan" },
    { label: "Pending withdrawals", value: String(managedWithdrawals.data?.data.summary.pending ?? 0), animationTarget: BigInt(managedWithdrawals.data?.data.summary.pending ?? 0), animationFormat: "integer", detail: "Requests awaiting review", icon: ArrowUpRight, loading: managedWithdrawals.isLoading, error: managedWithdrawals.isError, accent: "amber" },
    { label: "Loan applications", value: String(staffLoans.data?.data.total ?? 0), animationTarget: BigInt(staffLoans.data?.data.total ?? 0), animationFormat: "integer", detail: "Pending Staff review", icon: HandCoins, loading: staffLoans.isLoading, error: staffLoans.isError, accent: "violet" },
    { label: "Pending transaction reviews", value: String(managedTransactions.data?.data.summary.pending ?? 0), animationTarget: BigInt(managedTransactions.data?.data.summary.pending ?? 0), animationFormat: "integer", detail: "Pending transaction records in the last 7 days", icon: Activity, loading: managedTransactions.isLoading, error: managedTransactions.isError, accent: "blue" },
  ];

  const actions: LinkAction[] = isCustomer ? [
    { label: "Transfer money", description: "Send funds to another account", icon: ArrowLeftRight, href: "/transfer" },
    { label: "Deposit request", description: "Add funds to an account", icon: ArrowDownLeft, href: "/deposit" },
    { label: "Withdraw funds", description: "Create a withdrawal request", icon: ArrowUpRight, href: "/withdrawal" },
    { label: "Apply for a loan", description: "View or apply for a loan", icon: HandCoins, href: "/loans" },
    { label: "Account statements", description: "Review and download statements", icon: FileText, href: "/statements" },
  ] : role === "staff" ? [
    { label: "Deposit requests", description: "Review customer requests", icon: ArrowDownLeft, href: "/admin/deposits" },
    { label: "Withdrawal requests", description: "Review customer requests", icon: ArrowUpRight, href: "/admin/withdrawals" },
    { label: "Loan assistance", description: "Review and forward applications", icon: HandCoins, href: "/staff/loans" },
    { label: "Customer accounts", description: "View account records", icon: Building2, href: "/admin/accounts" },
    { label: "Transactions", description: "Review banking activity", icon: Activity, href: "/admin/transactions" },
  ] : [
    { label: "Manage customers", description: "Review user access and status", icon: Users, href: "/admin/users" },
    { label: "Manage accounts", description: "Open and manage bank accounts", icon: CreditCard, href: "/admin/accounts" },
    { label: "Deposit requests", description: "Review deposit operations", icon: ArrowDownLeft, href: "/admin/deposits" },
    { label: "Withdrawal requests", description: "Review withdrawal operations", icon: ArrowUpRight, href: "/admin/withdrawals" },
    { label: "Loan management", description: "Review, approve and disburse loans", icon: HandCoins, href: "/admin/loans" },
    { label: "Transactions", description: "Browse bank-wide activity", icon: Activity, href: "/admin/transactions" },
  ];

  return <div className="dashboard-overview mx-auto min-h-[calc(100vh-68px)] max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
    <PageIntro role={role}/>
    {isCustomer && <div className="mb-5"><MetricCard metric={customerMetrics[0]} featured/><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{customerMetrics.slice(1).map((metric, index) => <MetricCard key={metric.label} metric={metric} delay={(index + 1) * 55}/>)}</div><div className="mt-5"><CustomerAccountsPanel/></div></div>}
    {!isCustomer && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Dashboard summary">{(isAdmin ? adminMetrics : staffMetrics).map((metric, index) => <MetricCard key={metric.label} metric={metric} featured={index === 0} delay={index * 55}/>)}</section>}

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(310px,0.85fr)]">
      <div className="grid min-w-0 gap-5">
        <ActivityChart data={activity} loading={transactionQuery.isLoading} error={transactionQuery.isError} onRetry={() => void transactionQuery.refetch()} role={role} total={transactionCount}/>
        <RecentTransactions transactions={transactions} loading={transactionQuery.isLoading} error={transactionQuery.isError} onRetry={() => void transactionQuery.refetch()} href={isCustomer ? "/transactions" : "/admin/transactions"} ownAccountIds={ownAccountIds} role={role}/>
        {role === "staff" && <Panel title="Customer account overview" detail="Recent account holders available to your role" href="/admin/accounts">
          {managedAccounts.isLoading ? <div role="status" className="dashboard-skeleton mt-4 h-24 rounded-xl bg-white/[0.04]"/> : managedAccounts.isError ? <LoadError onRetry={() => void managedAccounts.refetch()}/> : managedAccounts.data?.data.accounts.length ? <div className="dashboard-content-enter mt-3 divide-y divide-white/[0.06]">{managedAccounts.data.data.accounts.map((account, index) => <div key={account.id} style={{ "--dashboard-delay": `${index * 30}ms` } as CSSProperties} className="dashboard-row-enter flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-white/[0.035]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-400/10 text-blue-200"><Building2 size={15}/></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{account.accountHolder?.name ?? "Customer unavailable"}</p><p className="mt-1 truncate font-mono text-[10px] text-slate-500">{account.accountNumber} · {account.accountType}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-semibold transition-colors ${account.status === "ACTIVE" ? "bg-emerald-300/10 text-emerald-200" : "bg-slate-300/10 text-slate-300"}`}>{account.status}</span></div>)}</div> : <EmptyState>No customer accounts available.</EmptyState>}
        </Panel>}
        {isAdmin && adminDisbursedLoans.data?.data.loans.length ? <Panel title="Recent disbursed loans" detail={`Outstanding amounts for the ${adminDisbursedLoans.data.data.loans.length} most recent records`} href="/admin/loans">
          <div className="mt-4 divide-y divide-white/[0.06]">{adminDisbursedLoans.data.data.loans.map((loan) => <div key={loan.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-mono text-xs font-semibold text-slate-200">{loan.loanId}</p><p className="mt-1 text-[10px] text-slate-500">{loan.customer?.name ?? "Customer unavailable"} · {dateLabel(loan.disbursedAt ?? loan.createdAt)}</p></div><div className="text-right"><p className="text-[10px] text-slate-500">Outstanding</p><p className="mt-0.5 text-xs font-semibold text-blue-200">{money(toPaisa(loan.outstandingBalance ?? loan.approvedAmount ?? "0.00"))}</p></div></div>)}</div>
          <p className="mt-2 text-[9px] text-slate-500">Recent records only; the current API does not provide an all-loan outstanding aggregate.</p>
        </Panel> : isAdmin && adminDisbursedLoans.isLoading ? <Panel title="Recent disbursed loans" detail="Loading outstanding amounts"><div role="status" className="dashboard-skeleton mt-4 h-24 rounded-xl bg-white/[0.04]"/></Panel> : null}
      </div>
      <div className="grid min-w-0 gap-5">
        {isCustomer ? <>
          <RequestStatusPanel title="Deposit requests" detail="Your request status overview" pending={customerDeposits.data?.data.summary.pending} approved={customerDeposits.data?.data.summary.approved} rejected={customerDeposits.data?.data.summary.rejected} href="/deposit" loading={customerDeposits.isLoading} error={customerDeposits.isError} onRetry={() => void customerDeposits.refetch()}/>
          <RequestStatusPanel title="Withdrawal requests" detail="Your request status overview" pending={customerWithdrawals.data?.data.summary.pending} approved={customerWithdrawals.data?.data.summary.approved} rejected={customerWithdrawals.data?.data.summary.rejected} href="/withdrawal" loading={customerWithdrawals.isLoading} error={customerWithdrawals.isError} onRetry={() => void customerWithdrawals.refetch()}/>
        </> : <>
          <RequestStatusPanel title="Deposit queue" detail="All-time request counts · available to operations" pending={managedDeposits.data?.data.summary.pending} approved={managedDeposits.data?.data.summary.approved} rejected={managedDeposits.data?.data.summary.rejected} href="/admin/deposits" loading={managedDeposits.isLoading} error={managedDeposits.isError} onRetry={() => void managedDeposits.refetch()}/>
          <RequestStatusPanel title="Withdrawal queue" detail="All-time request counts · available to operations" pending={managedWithdrawals.data?.data.summary.pending} approved={managedWithdrawals.data?.data.summary.approved} rejected={managedWithdrawals.data?.data.summary.rejected} href="/admin/withdrawals" loading={managedWithdrawals.isLoading} error={managedWithdrawals.isError} onRetry={() => void managedWithdrawals.refetch()}/>
        </>}
        <QuickActions actions={actions}/>
      </div>
    </div>
    <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-white/[0.07] pt-4 text-[10px] text-slate-500"><span>Northstar Bank · Secure banking workspace</span><span>Figures come from data available to your role.</span></footer>
  </div>;
}
