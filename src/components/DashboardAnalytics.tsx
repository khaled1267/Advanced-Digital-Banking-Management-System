"use client";

import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AdminAnalytics, CustomerAnalytics, DashboardAnalytics, StaffAnalytics } from "@/store/analyticsApi";
import { useGetDashboardAnalyticsQuery, type AnalyticsRangeQuery } from "@/store/analyticsApi";
import type { DashboardRole } from "@/components/DashboardShell";

const colors = ["#8291ff", "#6dd9cf", "#f6bd60", "#f28482", "#a78bfa", "#60a5fa"];
const statusColors: Record<string, string> = { COMPLETED: "#34d399", PENDING: "#f6bd60", FAILED: "#f28482", REVERSED: "#a78bfa" };
const compactMoneyFormat = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", notation: "compact", maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
type Point = Record<string, string | number>;

function amount(value: string) { return Number(value); }
function chartDate(value: string) { return dateFormat.format(new Date(`${value}T00:00:00Z`)); }
function exactBdt(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return "Unavailable";
  return `BDT ${BigInt(match[1]).toLocaleString("en-BD")}.${(match[2] ?? "").padEnd(2, "0").slice(0, 2)}`;
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="min-w-0 rounded-xl border border-white/[0.07] bg-[#10182b] px-4 py-3"><p className="text-[10px] font-medium text-slate-400">{label}</p><p className="mt-1 break-words text-lg font-semibold tracking-tight text-slate-100">{value}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></article>;
}

function Panel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#10182b] p-4 shadow-[0_12px_35px_rgba(0,0,0,0.12)] sm:p-5">
    <h3 className="text-sm font-semibold text-slate-100">{title}</h3><p className="mt-1 min-h-8 text-[11px] leading-4 text-slate-400">{detail}</p>{children}
  </section>;
}

function Empty({ children = "No activity recorded for this period." }: { children?: string }) {
  return <div className="mt-3 flex h-[220px] items-center justify-center rounded-xl border border-dashed border-white/10 px-5 text-center text-xs text-slate-400">{children}</div>;
}

function ChartFrame({ data, children, label }: { data: unknown[]; children: React.ReactNode; label: string }) {
  if (!data.length) return <Empty/>;
  return <div className="mt-3 h-[240px] min-w-0" role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>;
}

function ExactMoneyTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; payload?: Record<string, string | number> }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-white/10 bg-[var(--dashboard-tooltip-bg)] px-3 py-2 text-[11px] shadow-xl">
    {label && <p className="mb-1 font-medium text-[var(--dashboard-text)]">{label}</p>}
    {payload.map((entry, index) => {
      const key = entry.name === "Deposits" ? "depositExact" : entry.name === "Withdrawals" ? "withdrawalExact" : entry.name === "Approved amount" ? "approvedExact" : entry.name === "Disbursed amount" ? "disbursedExact" : entry.name === "Money in" ? "incomingExact" : entry.name === "Money out" ? "outgoingExact" : "amountExact";
      const raw = String(entry.payload?.[key] ?? "0.00");
      const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
      const formatted = match ? `BDT ${BigInt(match[1]).toLocaleString("en-BD")}.${(match[2] ?? "").padEnd(2, "0").slice(0, 2)}` : "BDT unavailable";
      return <p key={`${entry.name}-${index}`} className="text-[var(--dashboard-muted)]">{entry.name}: {formatted}</p>;
    })}
  </div>;
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-white/10 bg-[var(--dashboard-tooltip-bg)] px-3 py-2 text-[11px] shadow-xl">
    {label && <p className="mb-1 font-medium text-[var(--dashboard-text)]">{label}</p>}
    {payload.map((entry, index) => <p key={`${entry.name}-${index}`} className="text-[var(--dashboard-muted)]">{entry.name}: {entry.value?.toLocaleString("en-BD") ?? 0}</p>)}
  </div>;
}

function PieCard({ title, detail, rows, labelKey, valueKey, colors: palette = colors }: { title: string; detail: string; rows: Point[]; labelKey: string; valueKey: string; colors?: string[] }) {
  const data = rows.filter((row) => Number(row[valueKey]) > 0);
  return <Panel title={title} detail={detail}>
    {!data.length ? <Empty/> : <div className="mt-2 grid h-[240px] grid-cols-[minmax(0,1fr)_minmax(90px,0.85fr)] items-center gap-1 sm:gap-3">
      <div className="h-full min-w-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey={valueKey} nameKey={labelKey} innerRadius="54%" outerRadius="78%" paddingAngle={3} stroke="none" isAnimationActive>{data.map((row, index) => <Cell key={String(row[labelKey])} fill={palette[index % palette.length]}/>)}</Pie><Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border border-white/10 bg-[var(--dashboard-tooltip-bg)] px-3 py-2 text-[11px] text-[var(--dashboard-text)]">{String(payload[0].name)}: {Number(payload[0].value).toLocaleString("en-BD")}</div> : null}/></PieChart></ResponsiveContainer></div>
      <ul className="space-y-2">{data.map((row, index) => <li key={String(row[labelKey])} className="flex min-w-0 items-center gap-2 text-[10px]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }}/><span className="min-w-0 flex-1 truncate text-slate-400">{String(row[labelKey]).replaceAll("_", " ")}</span><span className="font-semibold text-slate-200">{Number(row[valueKey]).toLocaleString("en-BD")}</span></li>)}</ul>
    </div>}
  </Panel>;
}

function RangeFilter({ value, onChange, dates, setDates, onApply }: { value: AnalyticsRangeQuery; onChange: (value: AnalyticsRangeQuery) => void; dates: { startDate: string; endDate: string }; setDates: (value: { startDate: string; endDate: string }) => void; onApply: () => void }) {
  return <div className="flex flex-wrap items-center gap-2" aria-label="Analytics date range">
    <label className="sr-only" htmlFor="analytics-range">Analytics date range</label>
    <select id="analytics-range" value={value.range} onChange={(event) => onChange({ range: event.target.value as AnalyticsRangeQuery["range"] })} className="rounded-lg border border-white/10 bg-[#10182b] px-3 py-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-blue-400">
      <option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom dates</option>
    </select>
    {value.range === "custom" && <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
      <label className="sr-only" htmlFor="analytics-start">Start date</label><input id="analytics-start" type="date" value={dates.startDate} onChange={(event) => setDates({ ...dates, startDate: event.target.value })} className="rounded-lg border border-white/10 bg-[#10182b] px-2 py-2 text-xs text-slate-200" required/>
      <span className="text-[10px] text-slate-500">to</span>
      <label className="sr-only" htmlFor="analytics-end">End date</label><input id="analytics-end" type="date" value={dates.endDate} onChange={(event) => setDates({ ...dates, endDate: event.target.value })} className="rounded-lg border border-white/10 bg-[#10182b] px-2 py-2 text-xs text-slate-200" required/>
      <button type="submit" className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/25">Apply</button>
    </form>}
  </div>;
}

function AdminCharts({ data }: { data: AdminAnalytics }) {
  const trendMap = new Map<string, Point>();
  for (const row of data.depositWithdrawal) {
    const point = trendMap.get(row.date) ?? { date: row.date, label: chartDate(row.date), deposit: 0, withdrawal: 0, depositExact: "0.00", withdrawalExact: "0.00" };
    point[row.type === "DEPOSIT" ? "deposit" : "withdrawal"] = amount(row.amount);
    point[row.type === "DEPOSIT" ? "depositExact" : "withdrawalExact"] = row.amount;
    trendMap.set(row.date, point);
  }
  const trend = [...trendMap.values()];
  const types = Array.from(new Set(data.transactionTypes.map((row) => row.type))).map((type) => ({ type: type.replaceAll("_", " "), count: data.transactionTypes.filter((row) => row.type === type).reduce((total, row) => total + row.count, 0) }));
  const statuses = Object.entries(data.transactionStatuses).map(([status, count]) => ({ status, count }));
  const visibleStatuses = statuses.filter((row) => row.count > 0);
  const loanStatus = data.loanStatuses.filter((row) => row.count > 0).map((row) => ({ status: row.status.replaceAll("_", " "), count: row.count }));
  const loanAmounts = data.loanStatuses.filter((row) => amount(row.approvedAmount) > 0 || amount(row.disbursedAmount ?? "0") > 0).map((row) => ({ status: row.status.replaceAll("_", " "), approved: amount(row.approvedAmount), disbursed: amount(row.disbursedAmount ?? "0"), approvedExact: row.approvedAmount, disbursedExact: row.disbursedAmount ?? "0.00" }));
  const accounts = data.accounts.map((row) => ({ ...row, label: `${row.type} · ${row.status}` }));
  const repayments = data.repayments.map((row) => ({ ...row, label: chartDate(row.date), value: amount(row.amount), amountExact: row.amount }));
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    <Panel title="Deposits and withdrawals" detail="Successful transaction amounts by day · BDT"><ChartFrame data={trend} label="Daily successful deposit and withdrawal amounts"><LineChart data={trend} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => compactMoneyFormat.format(value)}/><Tooltip content={<ExactMoneyTooltip/>}/><Legend wrapperStyle={{ fontSize: 10, color: "var(--dashboard-muted)" }}/><Line type="monotone" dataKey="deposit" name="Deposits" stroke="#8291ff" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }}/><Line type="monotone" dataKey="withdrawal" name="Withdrawals" stroke="#6dd9cf" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }}/></LineChart></ChartFrame></Panel>
    <Panel title="Transaction volume by type" detail="Number of transaction records · counts, not amounts"><ChartFrame data={types} label="Transaction counts by type"><BarChart data={types} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="type" axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={48} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }}/><Tooltip content={<CountTooltip/>}/><Bar dataKey="count" name="Transactions" fill="#8291ff" radius={[5, 5, 0, 0]} isAnimationActive/></BarChart></ChartFrame></Panel>
    <PieCard title="Transaction statuses" detail="Records by stored transaction status" rows={visibleStatuses} labelKey="status" valueKey="count" colors={visibleStatuses.map((row) => statusColors[row.status] ?? colors[0])}/>
    <PieCard title="Loan applications" detail="Application counts by loan workflow status" rows={loanStatus} labelKey="status" valueKey="count"/>
    <Panel title="Approved and disbursed loan amounts" detail="Approved amount and disbursed amount are shown separately · BDT"><ChartFrame data={loanAmounts} label="Approved and disbursed loan amounts by status"><BarChart data={loanAmounts} margin={{ top: 8, right: 5, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }}/><YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => compactMoneyFormat.format(value)}/><Tooltip content={<ExactMoneyTooltip/>}/><Legend wrapperStyle={{ fontSize: 10, color: "var(--dashboard-muted)" }}/><Bar dataKey="approved" name="Approved amount" fill="#8291ff" radius={[4, 4, 0, 0]}/><Bar dataKey="disbursed" name="Disbursed amount" fill="#6dd9cf" radius={[4, 4, 0, 0]}/></BarChart></ChartFrame></Panel>
    <Panel title="Loan repayments" detail="Completed repayment records by day · BDT"><ChartFrame data={repayments} label="Daily completed loan repayment amounts"><LineChart data={repayments} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => compactMoneyFormat.format(value)}/><Tooltip content={<ExactMoneyTooltip/>}/><Line type="monotone" dataKey="value" name="Repayments" stroke="#f6bd60" strokeWidth={2.5} dot={false}/></LineChart></ChartFrame></Panel>
    <PieCard title="Account distribution" detail="Accounts grouped by actual type and status" rows={accounts} labelKey="label" valueKey="count"/>
  </div>;
}

function CustomerCharts({ data }: { data: CustomerAnalytics }) {
  const flow = data.cashFlow.map((row) => ({ date: row.date, label: chartDate(row.date), incoming: amount(row.incoming), outgoing: amount(row.outgoing), incomingExact: row.incoming, outgoingExact: row.outgoing }));
  const accounts = Array.from(new Set(data.accounts.map((row) => row.type))).map((type) => ({ type, count: data.accounts.filter((row) => row.type === type).length }));
  const loanStatuses = data.loanStatuses.filter((row) => row.count > 0).map((row) => ({ status: row.status.replaceAll("_", " "), count: row.count }));
  const repayments = data.repayments.map((row) => ({ ...row, label: chartDate(row.date), value: amount(row.amount), amountExact: row.amount }));
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    <Panel title="Money in vs money out" detail="Completed activity across your accounts · BDT"><ChartFrame data={flow} label="Personal incoming and outgoing activity"><BarChart data={flow} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => compactMoneyFormat.format(value)}/><Tooltip content={<ExactMoneyTooltip/>}/><Legend wrapperStyle={{ fontSize: 10, color: "var(--dashboard-muted)" }}/><Bar dataKey="incoming" name="Money in" fill="#8291ff" radius={[4, 4, 0, 0]}/><Bar dataKey="outgoing" name="Money out" fill="#6dd9cf" radius={[4, 4, 0, 0]}/></BarChart></ChartFrame></Panel>
    <Panel title="Transaction activity" detail="Completed transaction counts by day"><ChartFrame data={flow} label="Personal completed transaction activity"><LineChart data={flow} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }}/><Tooltip content={<CountTooltip/>}/><Line type="monotone" dataKey="count" name="Transactions" stroke="#8291ff" strokeWidth={2.5} dot={false}/></LineChart></ChartFrame></Panel>
    <PieCard title="My accounts" detail="Your accounts grouped by stored account type" rows={accounts} labelKey="type" valueKey="count"/>
    <PieCard title="My loan applications" detail="Your applications by workflow status" rows={loanStatuses} labelKey="status" valueKey="count"/>
    <Panel title="Outstanding loan balance" detail="Stored outstanding balance for your loans · BDT"><ChartFrame data={data.loanStatuses.filter((row) => amount(row.outstanding ?? "0") > 0).map((row) => ({ status: row.status.replaceAll("_", " "), value: amount(row.outstanding ?? "0"), amountExact: row.outstanding ?? "0.00" }))} label="Personal outstanding loan balance by status"><BarChart data={data.loanStatuses.filter((row) => amount(row.outstanding ?? "0") > 0).map((row) => ({ status: row.status.replaceAll("_", " "), value: amount(row.outstanding ?? "0"), amountExact: row.outstanding ?? "0.00" }))} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }}/><YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => compactMoneyFormat.format(value)}/><Tooltip content={<ExactMoneyTooltip/>}/><Bar dataKey="value" name="Outstanding" fill="#8291ff" radius={[5, 5, 0, 0]}/></BarChart></ChartFrame></Panel>
    <Panel title="Repayment history" detail="Your completed repayments by day · BDT"><ChartFrame data={repayments} label="Personal loan repayment history"><LineChart data={repayments} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }} tickFormatter={(value: number) => compactMoneyFormat.format(value)}/><Tooltip content={<ExactMoneyTooltip/>}/><Line type="monotone" dataKey="value" name="Repayments" stroke="#f6bd60" strokeWidth={2.5} dot={false}/></LineChart></ChartFrame></Panel>
  </div>;
}

function StaffCharts({ data }: { data: StaffAnalytics }) {
  const loans = data.loanStatuses.filter((row) => row.count > 0).map((row) => ({ status: row.status.replaceAll("_", " "), count: row.count }));
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    <Panel title="Request overview" detail="All-time deposit and withdrawal request counts · operational view"><ChartFrame data={data.requests.filter((row) => row.count > 0)} label="Staff deposit and withdrawal request counts"><BarChart data={data.requests.filter((row) => row.count > 0)} layout="vertical" margin={{ top: 5, right: 10, left: 16, bottom: 5 }}><CartesianGrid horizontal={false} stroke="var(--dashboard-chart-grid)" strokeDasharray="3 5"/><XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 9 }}/><YAxis type="category" dataKey="label" width={132} axisLine={false} tickLine={false} tick={{ fill: "var(--dashboard-chart-label)", fontSize: 10 }}/><Tooltip content={<CountTooltip/>}/><Bar dataKey="count" name="Requests" fill="#8291ff" radius={[0, 5, 5, 0]}/></BarChart></ChartFrame></Panel>
    <PieCard title="Loan review workflow" detail="All-time application counts by stored review status" rows={loans} labelKey="status" valueKey="count"/>
  </div>;
}

export function DashboardAnalytics({ role }: { role: DashboardRole }) {
  const [query, setQuery] = useState<AnalyticsRangeQuery>({ range: "30d" });
  const [dates, setDates] = useState({ startDate: "", endDate: "" });
  const request = useGetDashboardAnalyticsQuery(query);
  const applyDates = () => setQuery({ range: "custom", ...dates });
  const data = request.data?.data as DashboardAnalytics | undefined;
  const dashboardRole = role.toUpperCase();
  return <section className="mt-6 min-w-0" aria-labelledby="dashboard-analytics-heading">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Analytics</p><h2 id="dashboard-analytics-heading" className="mt-1 text-lg font-semibold text-slate-100">Banking activity</h2><p className="mt-1 text-[11px] text-slate-400">Charts are calculated from records available to your role.</p></div>{role !== "staff" && <RangeFilter value={query} onChange={setQuery} dates={dates} setDates={setDates} onApply={applyDates}/>}</div>
    {request.isLoading ? <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Loading analytics">{[0, 1, 2, 3].map((item) => <div key={item} className="dashboard-skeleton h-[330px] rounded-2xl border border-white/[0.07] bg-[#10182b]"/> )}</div>
      : request.isError ? <div role="alert" className="rounded-xl border border-rose-300/15 bg-rose-400/[0.06] px-4 py-4 text-xs text-rose-200">Could not load analytics. <button type="button" onClick={() => void request.refetch()} className="ml-1 font-semibold underline underline-offset-2">Try again</button></div>
        : !data ? <Empty/> : data.role !== dashboardRole ? <Empty>Analytics are unavailable for this role.</Empty>
          : <>
            {data.role === "ADMIN" && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric label="Total bank balance" value={exactBdt(data.summary.bankBalance)} detail="Combined stored account balances"/>
              <SummaryMetric label="Successful deposits" value={exactBdt(data.summary.deposits)} detail={`${data.summary.depositCount.toLocaleString("en-BD")} completed records · all time`}/>
              <SummaryMetric label="Successful withdrawals" value={exactBdt(data.summary.withdrawals)} detail={`${data.summary.withdrawalCount.toLocaleString("en-BD")} completed records · all time`}/>
              <SummaryMetric label="Transaction records" value={data.summary.transactionCount.toLocaleString("en-BD")} detail="All stored transaction statuses"/>
            </div>}
            {data.role === "CUSTOMER" && <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <SummaryMetric label="Successful deposits" value={exactBdt(data.summary.deposits)} detail={`${data.summary.depositCount.toLocaleString("en-BD")} of your completed records · all time`}/>
              <SummaryMetric label="Successful withdrawals" value={exactBdt(data.summary.withdrawals)} detail={`${data.summary.withdrawalCount.toLocaleString("en-BD")} of your completed records · all time`}/>
            </div>}
            {data.role === "ADMIN" ? <AdminCharts data={data}/>
            : data.role === "CUSTOMER" ? <CustomerCharts data={data}/>
              : <StaffCharts data={data}/>}
          </>}
  </section>;
}
