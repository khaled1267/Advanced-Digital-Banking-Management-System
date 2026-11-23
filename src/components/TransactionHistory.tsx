"use client";

import { useState } from "react";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, X } from "lucide-react";
import { TransactionReviewActions } from "@/components/TransactionReviewActions";
import {
  useGetAdminTransactionByIdQuery,
  useGetAdminTransactionsQuery,
  useGetMyTransactionByIdQuery,
  useGetMyTransactionsQuery,
  type TransactionRecord,
  type TransactionStatus,
  type TransactionType,
  type TransactionsQuery,
  type TransactionReviewStatus,
} from "@/store/transactionsApi";

type HistoryMode = "admin" | "customer";

const typeOptions: Array<{ value: TransactionType; label: string }> = [
  { value: "DEPOSIT", label: "Deposit" },
  { value: "WITHDRAWAL", label: "Withdrawal" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "LOAN_DISBURSEMENT", label: "Loan disbursement" },
  { value: "LOAN_REPAYMENT", label: "Loan repayment" },
];
const statusOptions: TransactionStatus[] = ["PENDING", "COMPLETED", "FAILED", "REVERSED"];
const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") return data.message;
  }
  return "Could not load transactions. Please try again.";
}

function statusStyle(status: TransactionStatus) {
  if (status === "COMPLETED") return "bg-emerald-400/10 text-emerald-200";
  if (status === "PENDING") return "bg-amber-400/10 text-amber-200";
  if (status === "FAILED") return "bg-rose-400/10 text-rose-200";
  return "bg-white/[0.07] text-slate-400";
}

function transactionTypeLabel(type: TransactionType) {
  return typeOptions.find((option) => option.value === type)?.label ?? type;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  const Icon = label === "Completed" ? CheckCircle2 : label === "Pending" ? Clock3 : label === "Failed" ? ArrowUpRight : Activity;
  return <article className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)]"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-400">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17}/></span></div><p className="mt-4 text-2xl font-semibold tracking-tight text-slate-100">{value.toLocaleString()}</p><p className="mt-1 text-[10px] text-slate-400">Matching current filters</p></article>;
}

function AccountRef({ account }: { account: TransactionRecord["fromAccount"] }) {
  return account ? <span className="font-mono text-[11px] text-slate-400">{account.maskedAccountNumber}</span> : <span className="text-xs text-slate-400">—</span>;
}

function TransactionDetails({ transaction, onClose, canStaffReview, showReview }: { transaction: TransactionRecord; onClose: () => void; canStaffReview: boolean; showReview: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="transaction-details-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#10182b] p-5 shadow-xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200">Transaction details</p><h2 id="transaction-details-title" className="mt-1 break-all font-mono text-lg font-semibold text-slate-100">{transaction.transactionId}</h2></div><button type="button" onClick={onClose} aria-label="Close transaction details" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]"><X size={18}/></button></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#080c18] p-4"><div><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Amount</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">{transaction.currency} {transaction.amount}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${statusStyle(transaction.status)}`}>{transaction.status}</span></div><dl className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2"><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Type</dt><dd className="mt-1 text-sm font-medium text-slate-200">{transactionTypeLabel(transaction.transactionType)}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date</dt><dd className="mt-1 text-sm font-medium text-slate-200">{formatDate(transaction.createdAt)}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">From account</dt><dd className="mt-1"><AccountRef account={transaction.fromAccount}/></dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">To account</dt><dd className="mt-1"><AccountRef account={transaction.toAccount}/></dd></div>{transaction.description && <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Description</dt><dd className="mt-1 text-sm text-slate-400">{transaction.description}</dd></div>}</dl>{showReview && <TransactionReviewActions targetType="TRANSACTION" targetId={transaction.id} canStaffReview={canStaffReview}/>}</section></div>;
}

export function TransactionHistory({ mode, canStaffReview = false }: { mode: HistoryMode; canStaffReview?: boolean }) {
  const [search, setSearch] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [status, setStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [suspiciousStatus, setSuspiciousStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const query: TransactionsQuery = {
    search: search.trim() || undefined,
    transactionType: transactionType ? transactionType as TransactionType : undefined,
    status: status ? status as TransactionStatus : undefined,
    reviewStatus: reviewStatus ? reviewStatus as TransactionReviewStatus : undefined,
    suspiciousStatus: suspiciousStatus ? suspiciousStatus as "FLAGGED" | "CLEAR" : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit: 10,
  };
  const adminQuery = useGetAdminTransactionsQuery(query, { skip: mode !== "admin" });
  const customerQuery = useGetMyTransactionsQuery(query, { skip: mode !== "customer" });
  const adminDetailQuery = useGetAdminTransactionByIdQuery(selectedTransactionId, {
    skip: mode !== "admin" || !selectedTransactionId,
  });
  const customerDetailQuery = useGetMyTransactionByIdQuery(selectedTransactionId, {
    skip: mode !== "customer" || !selectedTransactionId,
  });
  const result = mode === "admin" ? adminQuery.data?.data : customerQuery.data?.data;
  const isLoading = mode === "admin" ? adminQuery.isLoading : customerQuery.isLoading;
  const isError = mode === "admin" ? adminQuery.isError : customerQuery.isError;
  const error = mode === "admin" ? adminQuery.error : customerQuery.error;
  const refetch = mode === "admin" ? adminQuery.refetch : customerQuery.refetch;
  const selected = mode === "admin"
    ? adminDetailQuery.data?.data.transaction
    : customerDetailQuery.data?.data.transaction;
  const detailError = mode === "admin" ? adminDetailQuery.error : customerDetailQuery.error;
  const heading = mode === "admin" ? "Transaction management" : "My transactions";

  function changeFilter(update: () => void) {
    setPage(1);
    update();
  }

  return <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="text-xs font-medium text-slate-400">{mode === "admin" ? "Banking operations" : "Personal banking"}</p><div className="mt-1.5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-slate-100">{heading}</h1><p className="mt-1 text-sm text-slate-400">{mode === "admin" ? "Search transaction records and review activity without changing financial entries." : "Read-only history for your account activity."}</p></div><span className="rounded-full border border-white/[0.08] bg-[#10182b] px-3 py-1.5 text-[10px] font-medium text-slate-400">{mode === "admin" ? "Admin & Staff view" : "Your account activity"}</span></div></div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Transaction summary">
      <SummaryCard label="Total Transactions" value={result?.summary.total ?? 0} tone="bg-blue-400/10 text-blue-200"/>
      <SummaryCard label="Completed" value={result?.summary.completed ?? 0} tone="bg-emerald-400/10 text-emerald-200"/>
      <SummaryCard label="Pending" value={result?.summary.pending ?? 0} tone="bg-amber-400/10 text-amber-200"/>
      <SummaryCard label="Failed" value={result?.summary.failed ?? 0} tone="bg-rose-400/10 text-rose-200"/>
    </section>

    <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
      <div className={`grid gap-3 border-b border-white/[0.06] p-4 sm:grid-cols-2 ${mode === "admin" ? "lg:grid-cols-7" : "lg:grid-cols-5"} sm:p-5`}>
        <label className="lg:col-span-1"><span className="sr-only">Search transaction ID</span><input className={inputClass} placeholder="Search transaction ID" value={search} onChange={(event) => changeFilter(() => setSearch(event.target.value))}/></label>
        <select aria-label="Filter by transaction type" className={inputClass} value={transactionType} onChange={(event) => changeFilter(() => setTransactionType(event.target.value))}><option value="">All types</option>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <select aria-label="Filter by transaction status" className={inputClass} value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value))}><option value="">All statuses</option>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
        {mode === "admin" && <select aria-label="Filter by review status" className={inputClass} value={reviewStatus} onChange={(event) => changeFilter(() => setReviewStatus(event.target.value))}><option value="">All review statuses</option><option value="NOT_REVIEWED">Not reviewed</option><option value="UNDER_REVIEW">Under review</option><option value="REVIEWED">Reviewed</option></select>}
        {mode === "admin" && <select aria-label="Filter suspicious flags" className={inputClass} value={suspiciousStatus} onChange={(event) => changeFilter(() => setSuspiciousStatus(event.target.value))}><option value="">All flag states</option><option value="FLAGGED">Flagged for Admin review</option><option value="CLEAR">No active flag</option></select>}
        <label><span className="sr-only">Start date</span><input className={inputClass} type="date" aria-label="Start date" value={startDate} onChange={(event) => changeFilter(() => setStartDate(event.target.value))}/></label>
        <label><span className="sr-only">End date</span><input className={inputClass} type="date" aria-label="End date" value={endDate} onChange={(event) => changeFilter(() => setEndDate(event.target.value))}/></label>
      </div>

      {isLoading ? <div role="status" className="p-12 text-center text-sm text-slate-400">Loading transactions…</div> : isError ? <div role="alert" className="p-12 text-center"><p className="text-sm text-rose-200">{errorMessage(error)}</p><button type="button" onClick={() => void refetch()} className="mt-2 text-sm font-semibold text-emerald-200">Try again</button></div> : result?.transactions.length ? <>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3.5 font-semibold">Reference</th><th className="px-4 py-3.5 font-semibold">Type</th><th className="px-4 py-3.5 font-semibold">From</th><th className="px-4 py-3.5 font-semibold">To</th><th className="px-4 py-3.5 font-semibold">Amount</th><th className="px-4 py-3.5 font-semibold">Date</th><th className="px-4 py-3.5 font-semibold">Financial status</th>{mode === "admin" && <><th className="px-4 py-3.5 font-semibold">Review</th><th className="px-4 py-3.5 font-semibold">Flag</th></>}<th className="px-5 py-3.5 text-right font-semibold">Details</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{result.transactions.map((transaction) => <tr key={transaction.id} className="hover:bg-white/[0.035]"><td className="px-5 py-4 font-mono text-xs font-semibold text-slate-100">{transaction.transactionId}</td><td className="px-4 py-4 text-xs font-medium text-slate-400">{transactionTypeLabel(transaction.transactionType)}</td><td className="px-4 py-4"><AccountRef account={transaction.fromAccount}/></td><td className="px-4 py-4"><AccountRef account={transaction.toAccount}/></td><td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-slate-100">{transaction.currency} {transaction.amount}</td><td className="px-4 py-4 whitespace-nowrap text-[11px] text-slate-400">{formatDate(transaction.createdAt)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle(transaction.status)}`}>{transaction.status}</span></td>{mode === "admin" && <><td className="px-4 py-4 text-[10px] text-slate-300">{transaction.review?.status.replaceAll("_", " ") ?? "NOT REVIEWED"}</td><td className="px-4 py-4">{transaction.suspiciousFlag?.active !== false && transaction.suspiciousFlag ? <span className="rounded-full bg-amber-300/[0.08] px-2 py-1 text-[9px] font-semibold text-amber-100">FLAGGED</span> : <span className="text-[10px] text-slate-500">Clear</span>}</td></>}<td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelectedTransactionId(transaction.id)} className="text-xs font-semibold text-emerald-200 hover:text-blue-200">View</button></td></tr>)}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4"><p className="text-xs text-slate-400">{result.total.toLocaleString()} transactions · Page {result.page} of {Math.max(result.totalPages, 1)}</p><div className="flex gap-2"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" aria-label="Next page" disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>
      </> : <div className="p-12 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-slate-400"><Activity size={18}/></span><p className="mt-3 text-sm font-semibold text-slate-400">No transactions found</p><p className="mt-1 text-xs text-slate-400">Transactions will appear here when records are available.</p></div>}
    </section>

    {selectedTransactionId && selected && <TransactionDetails transaction={selected} onClose={() => setSelectedTransactionId("")} canStaffReview={canStaffReview} showReview={mode === "admin"}/>}
    {selectedTransactionId && !selected && (detailError ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-[#10182b] p-5 shadow-xl"><div className="flex items-start justify-between"><h2 className="font-semibold text-slate-200">Transaction details unavailable</h2><button type="button" onClick={() => setSelectedTransactionId("")} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]"><X size={17}/></button></div><p className="mt-2 text-sm text-slate-400">{errorMessage(detailError)}</p></section></div> : <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="status" className="rounded-2xl bg-[#10182b] px-8 py-6 text-sm text-slate-400 shadow-xl">Loading transaction details…</section></div>)}
  </div>;
}
