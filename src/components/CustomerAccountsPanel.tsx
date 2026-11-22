"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight, CreditCard, Wallet } from "lucide-react";
import { useGetMyAccountsQuery } from "@/store/bankAccountsApi";

function AccountStatus({ status }: { status: string }) {
  const classes = status === "ACTIVE"
    ? "bg-emerald-400/10 text-emerald-200"
    : status === "FROZEN"
      ? "bg-blue-400/10 text-blue-200"
      : status === "CLOSED"
      ? "bg-white/[0.06] text-slate-300"
      : "bg-amber-400/10 text-amber-200";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${classes}`}>{status}</span>;
}

export function CustomerAccountsPanel() {
  const { data, isLoading, isError, refetch } = useGetMyAccountsQuery();

  return (
    <section id="my-accounts" className="rounded-2xl border border-white/[0.07] bg-[#10182b] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.12)] sm:p-6" aria-labelledby="my-accounts-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">Your banking</p><h2 id="my-accounts-title" className="mt-1 text-lg font-semibold text-slate-100">My accounts</h2><p className="mt-1 text-xs text-slate-400">Balances and account status for your accounts.</p></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10 text-blue-200"><Wallet size={18} /></span>
      </div>
      {isLoading ? <div role="status" aria-label="Loading your accounts" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="dashboard-skeleton h-48 rounded-xl bg-white/[0.04]"/>)}</div> : isError ? <div className="dashboard-content-enter mt-5"><p role="alert" className="text-sm text-rose-300">Could not load your accounts.</p><button type="button" onClick={() => void refetch()} className="dashboard-interactive mt-2 rounded-md text-xs font-semibold text-blue-300 transition hover:text-blue-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Try again</button></div> : data?.data.accounts.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.data.accounts.map((account, index) => <article key={account.id} style={{ "--dashboard-delay": `${index * 65}ms` } as CSSProperties} className="dashboard-reveal dashboard-card-hover rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-start justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-400/10 text-blue-200"><CreditCard size={16} /></span><AccountStatus status={account.status} /></div><p className="mt-4 text-xs text-slate-400">{account.accountType === "SAVINGS" ? "Savings account" : "Current account"}</p><p className="mt-1 font-mono text-sm font-semibold tracking-wide text-slate-200">{account.accountNumber}</p><p className="mt-4 text-[10px] font-medium uppercase tracking-wider text-slate-500">Available balance</p><p className="dashboard-account-balance mt-1 text-xl font-semibold tracking-tight text-white">{account.currency} {account.balance}</p><Link href={`/accounts/${account.id}`} className="dashboard-interactive mt-4 inline-flex items-center gap-1 rounded text-xs font-semibold text-blue-300 transition hover:text-blue-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Account details <ArrowUpRight size={13} /></Link></article>)}</div> : <div className="dashboard-content-enter mt-5 rounded-xl border border-dashed border-white/10 px-5 py-8 text-center"><p className="text-sm font-semibold text-slate-200">No bank accounts yet</p><p className="mt-1 text-xs text-slate-400">Your accounts will appear here once opened.</p></div>}
    </section>
  );
}
