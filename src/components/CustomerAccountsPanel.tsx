"use client";

import Link from "next/link";
import { ArrowUpRight, CreditCard, Wallet } from "lucide-react";
import { useGetMyAccountsQuery } from "@/store/bankAccountsApi";

function AccountStatus({ status }: { status: string }) {
  const classes = status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700"
    : status === "FROZEN"
      ? "bg-blue-50 text-blue-700"
      : status === "CLOSED"
        ? "bg-slate-100 text-slate-600"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${classes}`}>{status}</span>;
}

export function CustomerAccountsPanel() {
  const { data, isLoading, isError, refetch } = useGetMyAccountsQuery();

  return (
    <section id="my-accounts" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6" aria-labelledby="my-accounts-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700">Your banking</p><h2 id="my-accounts-title" className="mt-1 text-lg font-semibold text-[#142B4A]">My accounts</h2><p className="mt-1 text-xs text-slate-500">Balances and account status for your accounts.</p></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#142B4A]"><Wallet size={18} /></span>
      </div>
      {isLoading ? <p className="mt-5 text-sm text-slate-500" role="status">Loading your accounts…</p> : isError ? <div className="mt-5"><p role="alert" className="text-sm text-rose-700">Could not load your accounts.</p><button type="button" onClick={() => void refetch()} className="mt-2 text-xs font-semibold text-emerald-700">Try again</button></div> : data?.data.accounts.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.data.accounts.map((account) => <article key={account.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:shadow-sm"><div className="flex items-start justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#142B4A]"><CreditCard size={16} /></span><AccountStatus status={account.status} /></div><p className="mt-4 text-xs text-slate-500">{account.accountType === "SAVINGS" ? "Savings account" : "Current account"}</p><p className="mt-1 font-mono text-sm font-semibold tracking-wide text-[#142B4A]">{account.accountNumber}</p><p className="mt-4 text-[10px] font-medium uppercase tracking-wider text-slate-400">Available balance</p><p className="mt-1 text-xl font-semibold tracking-tight text-[#142B4A]">{account.currency} {account.balance}</p><Link href={`/accounts/${account.id}`} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">Account details <ArrowUpRight size={13} /></Link></article>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center"><p className="text-sm font-semibold text-slate-700">No bank accounts yet</p><p className="mt-1 text-xs text-slate-500">Your accounts will appear here once opened.</p></div>}
    </section>
  );
}
