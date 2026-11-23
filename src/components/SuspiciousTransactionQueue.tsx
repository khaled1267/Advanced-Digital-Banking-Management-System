"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Search, ShieldCheck, X } from "lucide-react";
import { useGetSuspiciousFlagsQuery, useReviewSuspiciousFlagMutation, type SuspiciousFlagQuery, type SuspiciousFlagRecord } from "@/store/transactionReviewsApi";
import type { SuspiciousFlagReason, SuspiciousFlagStatus } from "@/store/transactionsApi";
import type { ReviewTargetType } from "@/store/transactionReviewsApi";

const reasons: Array<{ value: SuspiciousFlagReason; label: string }> = [
  { value: "UNUSUAL_AMOUNT", label: "Unusual amount" },
  { value: "UNUSUAL_ACTIVITY", label: "Unusual activity" },
  { value: "DUPLICATE_PATTERN", label: "Possible duplicate pattern" },
  { value: "ACCOUNT_CONCERN", label: "Account concern" },
  { value: "OTHER", label: "Other" },
];
const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10";

function getError(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error && typeof error.data === "object" && error.data !== null && "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "The Admin review could not be saved. Please try again.";
}
function dateLabel(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}
function targetLabel(type: ReviewTargetType) {
  return type === "TRANSACTION" ? "Transaction" : type === "DEPOSIT_REQUEST" ? "Deposit request" : "Withdrawal request";
}

function FlagRow({ flag, selected, onSelect }: { flag: SuspiciousFlagRecord; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`grid w-full gap-2 border-b border-white/[0.06] px-4 py-4 text-left transition hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5 ${selected ? "bg-blue-400/[0.05]" : ""}`}>
    <span className="min-w-0"><span className="block truncate font-mono text-xs font-semibold text-slate-100">{flag.target?.reference ?? "Target unavailable"}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{targetLabel(flag.targetType)} · {reasons.find((item) => item.value === flag.reason)?.label}</span></span>
    <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${flag.status === "OPEN" ? "bg-amber-300/[0.09] text-amber-100" : flag.status === "UNDER_REVIEW" ? "bg-blue-300/[0.09] text-blue-100" : "bg-white/[0.07] text-slate-300"}`}>{flag.status.replaceAll("_", " ")}</span>
    <span className="text-[10px] text-slate-500 sm:text-right">{dateLabel(flag.flaggedAt)}</span>
  </button>;
}

export function SuspiciousTransactionQueue() {
  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState<ReviewTargetType | "">("");
  const [status, setStatus] = useState<SuspiciousFlagStatus | "">("");
  const [reason, setReason] = useState<SuspiciousFlagReason | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const query: SuspiciousFlagQuery = { search: search.trim() || undefined, targetType, status, reason, startDate: startDate || undefined, endDate: endDate || undefined, page, limit: 10 };
  const listQuery = useGetSuspiciousFlagsQuery(query);
  const [reviewFlag, reviewState] = useReviewSuspiciousFlagMutation();
  const data = listQuery.data?.data;
  const selected = data?.flags.find((flag) => flag.id === selectedId);

  async function submit(status: "UNDER_REVIEW" | "RESOLVED" | "DISMISSED") {
    if (!selected) return;
    if ((status === "RESOLVED" || status === "DISMISSED") && adminNote.trim().length < 3) {
      setError("Add an Admin note of at least 3 characters before resolving or dismissing.");
      return;
    }
    const action = status === "UNDER_REVIEW" ? "start reviewing" : status.toLowerCase();
    if (!window.confirm(`Confirm ${action} this flag? The original financial record will remain unchanged.`)) return;
    setFeedback(""); setError("");
    try {
      await reviewFlag({ id: selected.id, status, ...(adminNote.trim() ? { note: adminNote.trim() } : {}) }).unwrap();
      setFeedback(status === "UNDER_REVIEW" ? "Flag review started." : `Flag ${status.toLowerCase()}.`);
      setAdminNote("");
    } catch (reasonValue: unknown) { setError(getError(reasonValue)); }
  }

  function filterChanged(update: () => void) { setPage(1); update(); }

  return <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-amber-200"><AlertTriangle size={13}/>Risk review queue</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Flagged for Admin Review</h1><p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">Staff flags are investigation signals, not fraud findings. Reviewing or resolving a flag does not reverse a transaction or freeze an account.</p></div>
    {(feedback || error) && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-xs ${error ? "border-rose-300/15 bg-rose-300/[0.05] text-rose-200" : "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200"}`}>{error || feedback}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(350px,0.9fr)]">
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b]" aria-label="Suspicious transaction flag list">
        <div className="grid gap-3 border-b border-white/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          <label className="relative"><span className="sr-only">Search transaction or request ID</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={(event) => filterChanged(() => setSearch(event.target.value))} placeholder="Search reference" className={`${inputClass} pl-9`}/></label>
          <select aria-label="Filter flag reason" className={inputClass} value={reason} onChange={(event) => filterChanged(() => setReason(event.target.value as SuspiciousFlagReason | ""))}><option value="">All reasons</option>{reasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select aria-label="Filter flag status" className={inputClass} value={status} onChange={(event) => filterChanged(() => setStatus(event.target.value as SuspiciousFlagStatus | ""))}><option value="">All active flags</option>{(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
          <select aria-label="Filter record type" className={inputClass} value={targetType} onChange={(event) => filterChanged(() => setTargetType(event.target.value as ReviewTargetType | ""))}><option value="">All record types</option><option value="TRANSACTION">Transaction</option><option value="DEPOSIT_REQUEST">Deposit request</option><option value="WITHDRAWAL_REQUEST">Withdrawal request</option></select>
          <input aria-label="Flag date from" className={inputClass} type="date" value={startDate} onChange={(event) => filterChanged(() => setStartDate(event.target.value))}/><input aria-label="Flag date to" className={inputClass} type="date" value={endDate} onChange={(event) => filterChanged(() => setEndDate(event.target.value))}/>
        </div>
        {listQuery.isLoading ? <p role="status" className="p-12 text-center text-sm text-slate-400">Loading flagged records…</p> : listQuery.isError ? <div role="alert" className="p-10 text-center"><p className="text-sm text-rose-200">Flagged transactions could not be loaded.</p><button type="button" onClick={() => void listQuery.refetch()} className="mt-2 text-xs font-semibold text-blue-200">Try again</button></div> : data?.flags.length ? <>
          {data.flags.map((flag) => <FlagRow key={flag.id} flag={flag} selected={selectedId === flag.id} onSelect={() => { setSelectedId(flag.id); setAdminNote(""); setError(""); }}/ >)}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5 sm:px-5"><p className="text-[10px] text-slate-500">{data.total} flags · Page {data.page} of {Math.max(data.totalPages, 1)}</p><div className="flex gap-2"><button type="button" aria-label="Previous flags page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronLeft size={15}/></button><button type="button" aria-label="Next flags page" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronRight size={15}/></button></div></div>
        </> : <div className="p-12 text-center"><ShieldCheck size={21} className="mx-auto text-slate-500"/><p className="mt-3 text-sm font-medium text-slate-300">No flagged records found</p><p className="mt-1 text-xs text-slate-500">The queue is clear for these filters.</p></div>}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 sm:p-6" aria-label="Flagged record details">
        {!selected ? <div className="py-7 text-center"><AlertTriangle size={21} className="mx-auto text-slate-500"/><p className="mt-3 text-sm font-medium text-slate-300">Select a flag to review</p><p className="mt-1 text-xs leading-5 text-slate-500">The original transaction remains read-only here.</p></div> : <>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">{targetLabel(selected.targetType)}</p><h2 className="mt-1 break-all font-mono text-base font-semibold text-slate-100">{selected.target?.reference ?? "Target unavailable"}</h2></div><span className="rounded-full bg-amber-300/[0.08] px-2.5 py-1 text-[9px] font-semibold text-amber-100">{selected.status.replaceAll("_", " ")}</span></div>
          {selected.target ? <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Financial status</dt><dd className="mt-1 font-semibold text-slate-200">{selected.target.financialStatus}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Amount</dt><dd className="mt-1 font-semibold text-slate-100">{selected.target.currency} {selected.target.amount}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">From account</dt><dd className="mt-1 font-mono text-slate-200">{selected.target.fromAccount?.maskedAccountNumber ?? "—"}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">To account</dt><dd className="mt-1 font-mono text-slate-200">{selected.target.toAccount?.maskedAccountNumber ?? "—"}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Transaction date</dt><dd className="mt-1 text-slate-200">{dateLabel(selected.target.createdAt)}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Flag reason</dt><dd className="mt-1 text-slate-200">{reasons.find((item) => item.value === selected.reason)?.label}</dd></div></dl> : <p role="alert" className="mt-4 text-xs text-rose-200">The linked financial record is no longer available. Its flag and history are preserved.</p>}
          <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[0.035] p-3"><p className="text-[10px] text-slate-500">Flagged by {selected.flaggedBy ? `${selected.flaggedBy.name} (${selected.flaggedBy.role})` : "unknown user"} · {dateLabel(selected.flaggedAt)}</p>{selected.explanation && <p className="mt-2 text-xs leading-5 text-slate-200">{selected.explanation}</p>}</div>
          {selected.staffReview && <div className="mt-3 rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-semibold text-slate-300">Staff review · {selected.staffReview.status.replaceAll("_", " ")}</p>{selected.staffReview.note && <p className="mt-1.5 text-xs leading-5 text-slate-400">{selected.staffReview.note}</p>}</div>}
          {selected.adminReviewNote && <p className="mt-3 rounded-xl bg-white/[0.035] p-3 text-xs leading-5 text-slate-300"><span className="font-semibold text-slate-200">Admin note: </span>{selected.adminReviewNote}</p>}
          <details className="mt-4" open><summary className="cursor-pointer text-xs font-semibold text-slate-300">Audit history ({selected.history.length + (selected.staffReview?.history.length ?? 0)})</summary><ol className="mt-3 space-y-3 border-l border-white/[0.08] pl-4">{[...(selected.staffReview?.history ?? []).map((entry) => ({ ...entry, source: "Staff review" })), ...selected.history.map((entry) => ({ ...entry, source: "Flag review" }))].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()).map((entry, index) => <li key={`${entry.source}-${entry.createdAt}-${index}`} className="text-[10px] leading-4 text-slate-500"><span className="font-semibold text-slate-300">{entry.source}: {entry.action.replaceAll("_", " ")}</span>{entry.actor ? ` · ${entry.actor.name} (${entry.actor.role})` : ""} · {dateLabel(entry.createdAt)}{entry.note && <p className="mt-1 text-slate-300">{entry.note}</p>}</li>)}</ol></details>
          {selected.active && <div className="mt-4 border-t border-white/[0.06] pt-4"><label htmlFor="admin-flag-note" className="block text-[10px] font-medium text-slate-400">Admin review note<textarea id="admin-flag-note" className={`${inputClass} mt-1.5 min-h-20 resize-y`} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} maxLength={500} placeholder="Record the outcome or next action."/></label><div className="mt-3 flex flex-wrap justify-end gap-2">{selected.status === "OPEN" && <button type="button" disabled={reviewState.isLoading} onClick={() => void submit("UNDER_REVIEW")} className="rounded-lg border border-blue-300/15 px-3 py-2 text-[10px] font-semibold text-blue-100 disabled:opacity-40">Start Admin review</button>}<button type="button" disabled={reviewState.isLoading || adminNote.trim().length < 3} onClick={() => void submit("DISMISSED")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[10px] font-semibold text-slate-300 disabled:opacity-40"><X size={13}/>Dismiss</button><button type="button" disabled={reviewState.isLoading || adminNote.trim().length < 3} onClick={() => void submit("RESOLVED")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40"><Check size={13}/>Resolve</button></div></div>}
        </>}
      </section>
    </div>
  </div>;
}
