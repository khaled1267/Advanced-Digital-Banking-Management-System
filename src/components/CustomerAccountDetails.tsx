"use client";

import Link from "next/link";
import { ArrowLeft, CreditCard } from "lucide-react";
import { useGetMyAccountByIdQuery } from "@/store/bankAccountsApi";

export function CustomerAccountDetails({ accountId }: { accountId: string }) {
  const { data, isLoading, isError, refetch } = useGetMyAccountByIdQuery(accountId);
  const account = data?.data.account;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-10">
      <Link href="/accounts" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700"><ArrowLeft size={16} /> Back to my accounts</Link>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {isLoading ? <p role="status" className="py-12 text-center text-sm text-slate-500">Loading account details…</p> : isError ? <div className="py-12 text-center"><p role="alert" className="text-sm text-rose-700">Could not load this account.</p><button type="button" onClick={() => void refetch()} className="mt-2 text-sm font-semibold text-emerald-700">Try again</button></div> : account ? <><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#142B4A]"><CreditCard size={21} /></span><p className="mt-5 text-xs font-medium text-slate-500">{account.accountType === "SAVINGS" ? "Savings account" : "Current account"}</p><h1 className="mt-1 font-mono text-xl font-semibold tracking-wider text-[#142B4A]">{account.accountNumber}</h1><div className="mt-6 rounded-xl bg-[#f5f7fa] p-5"><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Available balance</p><p className="mt-2 text-3xl font-semibold tracking-tight text-[#142B4A]">{account.currency} {account.balance}</p></div><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Account status</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{account.status}</dd></div><div><dt className="text-xs text-slate-500">Opened</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(account.createdAt))}</dd></div><div><dt className="text-xs text-slate-500">Currency</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{account.currency} · Bangladeshi Taka</dd></div></dl></> : <p className="py-12 text-center text-sm text-slate-500">Account not found.</p>}
      </section>
    </div>
  );
}
