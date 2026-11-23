"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { TransactionReviewActions } from "@/components/TransactionReviewActions";
import { useGetAdminDepositsQuery, type DepositRecord } from "@/store/depositsApi";
import { useGetAdminWithdrawalsQuery, type WithdrawalRecord } from "@/store/withdrawalsApi";
import type { ReviewTargetType } from "@/store/transactionReviewsApi";
import { useGetTransactionReviewQuery } from "@/store/transactionReviewsApi";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function PendingRow({ type, record, selected, onSelect }: { type: "DEPOSIT_REQUEST" | "WITHDRAWAL_REQUEST"; record: DepositRecord | WithdrawalRecord; selected: boolean; onSelect: () => void }) {
  const isDeposit = type === "DEPOSIT_REQUEST";
  const reference = isDeposit ? (record as DepositRecord).depositId : (record as WithdrawalRecord).withdrawalId;
  const review = useGetTransactionReviewQuery({ targetType: type, targetId: record.id });
  return <button type="button" aria-pressed={selected} onClick={onSelect} className={`grid w-full gap-2 border-b border-white/[0.06] px-4 py-3.5 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5 ${selected ? "bg-blue-400/[0.05]" : "hover:bg-white/[0.03]"}`}>
    <span className="flex min-w-0 items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDeposit ? "bg-emerald-300/[0.08] text-emerald-200" : "bg-violet-300/[0.08] text-violet-200"}`}>{isDeposit ? <ArrowDownLeft size={15}/> : <ArrowUpRight size={15}/>}</span><span className="min-w-0"><span className="block truncate font-mono text-xs font-semibold text-slate-100">{reference}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{isDeposit ? "Deposit request" : "Withdrawal request"} · {record.account?.maskedAccountNumber ?? "Account unavailable"}</span><span className="mt-1 flex flex-wrap gap-x-2 text-[9px] text-slate-500"><span>Review: {review.isLoading ? "Loading…" : review.isError ? "Unavailable" : review.data?.data.review.status.replaceAll("_", " ") ?? "Not reviewed"}</span>{review.data?.data.flag?.active && <span className="font-semibold text-amber-100">Flagged for Admin Review</span>}</span></span></span>
    <span className="whitespace-nowrap text-xs font-semibold text-slate-200">BDT {record.amount}</span><span className="text-[10px] text-slate-500">{dateLabel(record.createdAt)}</span>
  </button>;
}

export function StaffPendingRequestQueue() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<"ALL" | "DEPOSIT_REQUEST" | "WITHDRAWAL_REQUEST">("ALL");
  const [selected, setSelected] = useState<{ type: ReviewTargetType; item: DepositRecord | WithdrawalRecord } | null>(null);
  const deposits = useGetAdminDepositsQuery({ status: "PENDING", page, limit: 5 }, { skip: kind === "WITHDRAWAL_REQUEST" });
  const withdrawals = useGetAdminWithdrawalsQuery({ status: "PENDING", page, limit: 5 }, { skip: kind === "DEPOSIT_REQUEST" });
  const depositItems = deposits.data?.data.deposits ?? [];
  const withdrawalItems = withdrawals.data?.data.withdrawals ?? [];
  const loading = (kind !== "WITHDRAWAL_REQUEST" && deposits.isLoading) || (kind !== "DEPOSIT_REQUEST" && withdrawals.isLoading);
  const failed = (kind !== "WITHDRAWAL_REQUEST" && deposits.isError) || (kind !== "DEPOSIT_REQUEST" && withdrawals.isError);
  const rows = [
    ...(kind !== "WITHDRAWAL_REQUEST" ? depositItems.map((item) => ({ type: "DEPOSIT_REQUEST" as const, item })) : []),
    ...(kind !== "DEPOSIT_REQUEST" ? withdrawalItems.map((item) => ({ type: "WITHDRAWAL_REQUEST" as const, item })) : []),
  ].sort((left, right) => new Date(right.item.createdAt).getTime() - new Date(left.item.createdAt).getTime());
  const totalPages = Math.max(kind === "DEPOSIT_REQUEST" ? deposits.data?.data.totalPages ?? 1 : kind === "WITHDRAWAL_REQUEST" ? withdrawals.data?.data.totalPages ?? 1 : Math.max(deposits.data?.data.totalPages ?? 1, withdrawals.data?.data.totalPages ?? 1), 1);

  return <section className="mx-auto mt-7 max-w-[1440px] px-5 pb-8 sm:px-8 lg:px-10" aria-labelledby="pending-review-heading">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200"><Clock3 size={13}/>Review queue</p><h2 id="pending-review-heading" className="mt-1 text-lg font-semibold text-slate-100">Pending deposit and withdrawal requests</h2><p className="mt-1 text-xs text-slate-400">Start and complete operational review here. Financial approval remains a separate existing workflow.</p></div><select aria-label="Filter pending request type" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setPage(1); }} className="rounded-xl border border-white/[0.08] bg-[#10182b] px-3 py-2.5 text-xs text-slate-200"><option value="ALL">All requests</option><option value="DEPOSIT_REQUEST">Deposits</option><option value="WITHDRAWAL_REQUEST">Withdrawals</option></select></div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(350px,0.8fr)]">
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b]">
        {loading ? <p role="status" className="p-10 text-center text-sm text-slate-400">Loading pending requests…</p> : failed ? <div role="alert" className="p-10 text-center"><p className="text-sm text-rose-200">Pending requests could not be loaded.</p><button type="button" onClick={() => { if (kind !== "WITHDRAWAL_REQUEST") void deposits.refetch(); if (kind !== "DEPOSIT_REQUEST") void withdrawals.refetch(); }} className="mt-2 text-xs font-semibold text-blue-200">Try again</button></div> : rows.length ? <>
          {rows.map(({ type, item }) => <PendingRow key={`${type}-${item.id}`} type={type} record={item} selected={selected?.item.id === item.id && selected.type === type} onSelect={() => setSelected({ type, item })}/>)}
          <div className="flex items-center justify-between px-4 py-3.5 sm:px-5"><p className="text-[10px] text-slate-500">Page {page} of {totalPages}</p><div className="flex gap-2"><button type="button" aria-label="Previous pending requests page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronLeft size={15}/></button><button type="button" aria-label="Next pending requests page" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronRight size={15}/></button></div></div>
        </> : <p className="p-10 text-center text-sm text-slate-400">No pending requests in this queue.</p>}
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 sm:p-6">
        {!selected ? <div className="py-4 text-center"><Clock3 size={20} className="mx-auto text-slate-500"/><p className="mt-3 text-sm font-medium text-slate-300">Select a pending request</p><p className="mt-1 text-xs leading-5 text-slate-500">Reviewing a request will not approve or reject its financial operation.</p></div> : <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">{selected.type === "DEPOSIT_REQUEST" ? "Deposit request" : "Withdrawal request"}</p><h3 className="mt-1 break-all font-mono text-sm font-semibold text-slate-100">{selected.type === "DEPOSIT_REQUEST" ? (selected.item as DepositRecord).depositId : (selected.item as WithdrawalRecord).withdrawalId}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Financial status</dt><dd className="mt-1 font-semibold text-amber-100">{selected.item.status}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Amount</dt><dd className="mt-1 font-semibold text-slate-100">BDT {selected.item.amount}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Account</dt><dd className="mt-1 font-mono text-slate-200">{selected.item.account?.maskedAccountNumber ?? "Unavailable"}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Request date</dt><dd className="mt-1 text-slate-200">{dateLabel(selected.item.createdAt)}</dd></div></dl>
          {selected.item.description && <p className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs leading-5 text-slate-300">{selected.item.description}</p>}
          <TransactionReviewActions targetType={selected.type} targetId={selected.item.id}/>
        </>}
      </div>
    </div>
  </section>;
}
