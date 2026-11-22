"use client";

import { useState } from "react";
import { ArrowUpRight, FileText, ShieldCheck, Wallet } from "lucide-react";
import { parseBdtPaisa } from "@/lib/bdt-money";
import { useGetMyAccountsQuery } from "@/store/bankAccountsApi";
import {
  useCreateWithdrawalRequestMutation,
  useGetAdminWithdrawalByIdQuery,
  useGetAdminWithdrawalsQuery,
  useGetMyWithdrawalsQuery,
  useReviewWithdrawalMutation,
  type WithdrawalRecord,
  type WithdrawalStatus,
  type WithdrawalsQuery,
} from "@/store/withdrawalsApi";
import { apiMessage, formatDate, inputClass, statusClass, StatusSummary } from "@/components/DepositPages";

function CustomerWithdrawalList() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useGetMyWithdrawalsQuery({ page, limit: 8 });
  const result = data?.data;
  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
    <div className="border-b border-white/[0.06] p-5"><h2 className="text-sm font-semibold text-slate-100">Recent withdrawal requests</h2><p className="mt-1 text-xs text-slate-400">Track the review status of your requests.</p></div>
    {isLoading ? <div className="p-10 text-center text-sm text-slate-400" role="status">Loading withdrawal requests…</div> : isError ? <div className="p-10 text-center"><p role="alert" className="text-sm text-rose-200">{apiMessage(error, "Could not load withdrawal requests.")}</p><button type="button" onClick={() => void refetch()} className="mt-2 text-xs font-semibold text-emerald-200">Try again</button></div> : result?.withdrawals.length ? <>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Reference</th><th className="px-4 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Submitted</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{result.withdrawals.map((withdrawal) => <tr key={withdrawal.id}><td className="px-5 py-4 font-mono text-xs font-semibold text-slate-100">{withdrawal.withdrawalId}</td><td className="px-4 py-4 font-mono text-[11px] text-slate-400">{withdrawal.account?.maskedAccountNumber ?? "Unavailable"}</td><td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-slate-100">BDT {withdrawal.amount}</td><td className="px-4 py-4 whitespace-nowrap text-[11px] text-slate-400">{formatDate(withdrawal.createdAt)}</td><td className="px-5 py-4"><span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold " + statusClass(withdrawal.status)}>{withdrawal.status}</span>{withdrawal.rejectionReason && <p className="mt-1 max-w-48 text-[10px] text-rose-200">{withdrawal.rejectionReason}</p>}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4"><p className="text-xs text-slate-400">{result.total} requests · Page {result.page} of {Math.max(result.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs disabled:opacity-40">Next</button></div></div>
    </> : <div className="p-10 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-slate-400"><FileText size={18}/></span><p className="mt-3 text-sm font-semibold text-slate-400">No withdrawal requests yet</p><p className="mt-1 text-xs text-slate-400">Requests you submit will appear here.</p></div>}
  </section>;
}

export function CustomerWithdrawalPage() {
  const { data: accountData, isLoading: accountsLoading, isError: accountsError } = useGetMyAccountsQuery();
  const accounts = accountData?.data.accounts.filter((account) => account.status === "ACTIVE") ?? [];
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [createWithdrawal, createState] = useCreateWithdrawalRequestMutation();
  const amountPaisa = parseBdtPaisa(amount.trim());
  const amountValid = amountPaisa !== null && amountPaisa > BigInt("0");
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const availablePaisa = selectedAccount ? parseBdtPaisa(selectedAccount.balance) : null;
  const exceedsBalance = amountValid && availablePaisa !== null && amountPaisa > availablePaisa;

  async function submitRequest() {
    if (!selectedAccount || !amountValid) return;
    setFeedback("");
    try {
      const result = await createWithdrawal({ accountId, amount: amount.trim(), description: description.trim() || undefined }).unwrap();
      setFeedback("Request " + result.data.withdrawal.withdrawalId + " was submitted and is awaiting review.");
      setFeedbackError(false);
      setAmount("");
      setDescription("");
      setConfirming(false);
    } catch (error: unknown) {
      setFeedback(apiMessage(error, "Could not submit your withdrawal request."));
      setFeedbackError(true);
    }
  }

  return <div className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="text-xs font-medium text-slate-400">Personal banking</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-100">Request a withdrawal</h1><p className="mt-1 text-sm text-slate-400">Submit a request for an authorized banking team member to review.</p></div>
    <div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-200"><ArrowUpRight size={19}/></span><div><h2 className="text-sm font-semibold text-slate-100">New withdrawal request</h2><p className="mt-1 text-xs text-slate-400">Submitting does not immediately deduct your balance.</p></div></div>
        <div className="mt-5 space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Active account</span><select className={inputClass} value={accountId} onChange={(event) => { setAccountId(event.target.value); setConfirming(false); }} disabled={accountsLoading || accountsError || accounts.length === 0}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.accountType} · {account.accountNumber}</option>)}</select>{accountsLoading && <span className="mt-1 block text-[10px] text-slate-400">Loading your accounts…</span>}{accountsError && <span role="alert" className="mt-1 block text-[10px] text-rose-200">Could not load your accounts.</span>}{!accountsLoading && !accountsError && accounts.length === 0 && <span className="mt-1 block text-[10px] text-amber-200">You need an active account to request a withdrawal.</span>}</label>
          {selectedAccount && <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10182b] text-slate-100"><Wallet size={16}/></span><div><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Available balance</p><p className="mt-0.5 text-sm font-semibold text-slate-100">BDT {selectedAccount.balance}</p></div></div>}
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Amount (BDT)</span><input className={inputClass} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => { setAmount(event.target.value); setConfirming(false); }}/><span className="mt-1 block text-[10px] text-slate-400">Enter a positive amount with up to two poisha decimal places.</span>{amount.length > 0 && !amountValid && <span className="mt-1 block text-[10px] text-rose-200">Enter a valid positive amount.</span>}{exceedsBalance && <span role="status" className="mt-1 block text-[10px] text-amber-200">This is above the displayed available balance. The request can be approved only if the account has enough funds at review time.</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Description <span className="font-normal text-slate-400">(optional)</span></span><textarea className={inputClass + " min-h-24 resize-y"} maxLength={120} placeholder="Add a short note for the reviewer" value={description} onChange={(event) => { setDescription(event.target.value); setConfirming(false); }}/><span className="mt-1 block text-right text-[10px] text-slate-400">{description.length}/120</span></label>
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3.5"><div className="flex items-start gap-2.5"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-200"/><p className="text-xs leading-5 text-blue-100">The request remains pending until review. Balance is deducted only after approval and only if sufficient funds are still available.</p></div></div>
          {feedback && <p role={feedbackError ? "alert" : "status"} className={"rounded-xl px-3.5 py-2.5 text-xs " + (feedbackError ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")}>{feedback}</p>}
          {confirming ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><p className="text-xs font-semibold text-slate-100">Review your request</p><p className="mt-2 text-xs text-slate-400">BDT {amount} from {selectedAccount?.accountType} account ending {selectedAccount?.accountNumber.slice(-4)}</p>{description.trim() && <p className="mt-1 text-xs text-slate-400">Note: {description.trim()}</p>}{exceedsBalance && <p className="mt-2 text-xs font-medium text-amber-200">The displayed balance is lower than this amount.</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void submitRequest()} disabled={createState.isLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{createState.isLoading ? "Submitting…" : "Confirm withdrawal request"}</button><button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-white/[0.08] bg-[#10182b] px-4 py-2.5 text-xs font-semibold text-slate-400">Edit</button></div></div> : <button type="button" disabled={!selectedAccount || !amountValid} onClick={() => { setFeedback(""); setConfirming(true); }} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">Review withdrawal request</button>}
        </div>
      </section>
      <CustomerWithdrawalList/>
    </div>
  </div>;
}

function WithdrawalDetails({ withdrawal, onClose }: { withdrawal: WithdrawalRecord; onClose: () => void }) {
  const [action, setAction] = useState<"APPROVE" | "REJECT" | "">("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [review, reviewState] = useReviewWithdrawalMutation();
  async function confirmReview() {
    if (!action) return;
    setMessage("");
    try {
      await review(action === "APPROVE" ? { id: withdrawal.id, action } : { id: withdrawal.id, action, rejectionReason: reason.trim() }).unwrap();
      setIsError(false);
      setMessage(action === "APPROVE" ? "Withdrawal approved and account balance updated." : "Withdrawal request rejected.");
      setAction("");
    } catch (error: unknown) {
      setIsError(true);
      setMessage(apiMessage(error, "Could not review this request."));
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="withdrawal-detail-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#10182b] p-5 shadow-xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200">Withdrawal request</p><h2 id="withdrawal-detail-title" className="mt-1 break-all font-mono text-lg font-semibold text-slate-100">{withdrawal.withdrawalId}</h2></div><button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]">×</button></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#080c18] p-4"><div><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Amount</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">BDT {withdrawal.amount}</p></div><span className={"rounded-full px-3 py-1 text-[10px] font-semibold " + statusClass(withdrawal.status)}>{withdrawal.status}</span></div>
    <dl className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2"><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer</dt><dd className="mt-1 text-sm font-medium text-slate-200">{withdrawal.customer?.name ?? "Unavailable"}</dd><dd className="text-xs text-slate-400">{withdrawal.customer?.email}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Account</dt><dd className="mt-1 font-mono text-xs text-slate-400">{withdrawal.account?.maskedAccountNumber ?? "Unavailable"}</dd><dd className="text-xs text-slate-400">{withdrawal.account?.accountType} · {withdrawal.account?.status}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submitted</dt><dd className="mt-1 text-sm text-slate-400">{formatDate(withdrawal.createdAt)}</dd></div>{withdrawal.reviewedAt && <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reviewed</dt><dd className="mt-1 text-sm text-slate-400">{formatDate(withdrawal.reviewedAt)}</dd></div>}{withdrawal.description && <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Description</dt><dd className="mt-1 text-sm text-slate-400">{withdrawal.description}</dd></div>}{withdrawal.rejectionReason && <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rejection reason</dt><dd className="mt-1 text-sm text-rose-200">{withdrawal.rejectionReason}</dd></div>}{withdrawal.transactionId && <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Linked transaction</dt><dd className="mt-1 font-mono text-xs text-slate-400">{withdrawal.transactionId}</dd></div>}</dl>
    {message && <p role={isError ? "alert" : "status"} className={"mt-4 rounded-xl px-3 py-2 text-xs " + (isError ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")}>{message}</p>}
    {withdrawal.status === "PENDING" && !action && <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4"><button type="button" onClick={() => setAction("REJECT")} className="rounded-xl border border-rose-400/20 px-4 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10">Reject</button><button type="button" onClick={() => setAction("APPROVE")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500">Approve</button></div>}
    {action && <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><p className="text-xs font-semibold text-amber-100">Confirm {action.toLowerCase()}?</p>{action === "APPROVE" ? <p className="mt-1 text-xs leading-5 text-amber-200">Approval checks the latest balance and atomically deducts funds with a completed withdrawal transaction.</p> : <label className="mt-3 block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Reason for rejection</span><textarea className={inputClass} minLength={5} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this request is rejected"/><span className="mt-1 block text-[10px] text-slate-400">5–300 characters</span></label>}<div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={reviewState.isLoading} onClick={() => setAction("")} className="rounded-xl border border-white/[0.08] bg-[#10182b] px-4 py-2 text-xs font-semibold text-slate-400">Cancel</button><button type="button" disabled={reviewState.isLoading || (action === "REJECT" && reason.trim().length < 5)} onClick={() => void confirmReview()} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{reviewState.isLoading ? "Processing…" : "Confirm " + action.toLowerCase()}</button></div></div>}
    {withdrawal.status !== "PENDING" && <div className="mt-5 flex justify-end border-t border-white/[0.06] pt-4"><button type="button" onClick={onClose} className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-semibold text-slate-400">Close</button></div>}
  </section></div>;
}

export function AdminWithdrawalManagement() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const query: WithdrawalsQuery = { search: search.trim() || undefined, status: status ? status as WithdrawalStatus : undefined, startDate: startDate || undefined, endDate: endDate || undefined, page, limit: 10 };
  const { data, isLoading, isError, error, refetch } = useGetAdminWithdrawalsQuery(query);
  const detail = useGetAdminWithdrawalByIdQuery(selectedId, { skip: !selectedId });
  const result = data?.data;
  function updateFilter(update: () => void) { setPage(1); update(); }

  return <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="text-xs font-medium text-slate-400">Banking operations</p><div className="mt-1.5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-slate-100">Withdrawal management</h1><p className="mt-1 text-sm text-slate-400">Review customer requests and verify available funds before approval.</p></div><span className="rounded-full border border-white/[0.08] bg-[#10182b] px-3 py-1.5 text-[10px] font-medium text-slate-400">Admin &amp; Staff</span></div></div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Withdrawal request summary"><StatusSummary label="Total requests" value={result?.summary.total} tone="bg-blue-400/10 text-blue-200"/><StatusSummary label="Pending" value={result?.summary.pending} tone="bg-amber-400/10 text-amber-200"/><StatusSummary label="Approved" value={result?.summary.approved} tone="bg-emerald-400/10 text-emerald-200"/><StatusSummary label="Rejected" value={result?.summary.rejected} tone="bg-rose-400/10 text-rose-200"/></section>
    <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
      <div className="grid gap-3 border-b border-white/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5"><input aria-label="Search withdrawal reference" className={inputClass} placeholder="Search withdrawal reference" value={search} onChange={(event) => updateFilter(() => setSearch(event.target.value))}/><select aria-label="Filter by withdrawal status" className={inputClass} value={status} onChange={(event) => updateFilter(() => setStatus(event.target.value))}><option value="">All statuses</option>{(["PENDING", "APPROVED", "REJECTED"] as const).map((option) => <option key={option} value={option}>{option}</option>)}</select><input type="date" aria-label="Start date" className={inputClass} value={startDate} onChange={(event) => updateFilter(() => setStartDate(event.target.value))}/><input type="date" aria-label="End date" className={inputClass} value={endDate} onChange={(event) => updateFilter(() => setEndDate(event.target.value))}/></div>
      {isLoading ? <div role="status" className="p-12 text-center text-sm text-slate-400">Loading withdrawal requests…</div> : isError ? <div className="p-12 text-center"><p role="alert" className="text-sm text-rose-200">{apiMessage(error, "Could not load withdrawal requests.")}</p><button type="button" onClick={() => void refetch()} className="mt-2 text-sm font-semibold text-emerald-200">Try again</button></div> : result?.withdrawals.length ? <>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3.5 font-semibold">Reference</th><th className="px-4 py-3.5 font-semibold">Customer</th><th className="px-4 py-3.5 font-semibold">Account</th><th className="px-4 py-3.5 font-semibold">Amount</th><th className="px-4 py-3.5 font-semibold">Submitted</th><th className="px-4 py-3.5 font-semibold">Status</th><th className="px-5 py-3.5 text-right font-semibold">Details</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{result.withdrawals.map((withdrawal) => <tr key={withdrawal.id} className="hover:bg-white/[0.035]"><td className="px-5 py-4 font-mono text-xs font-semibold text-slate-100">{withdrawal.withdrawalId}</td><td className="px-4 py-4"><p className="text-xs font-medium text-slate-200">{withdrawal.customer?.name ?? "Unavailable"}</p><p className="mt-0.5 text-[10px] text-slate-400">{withdrawal.customer?.email}</p></td><td className="px-4 py-4 font-mono text-[11px] text-slate-400">{withdrawal.account?.maskedAccountNumber ?? "Unavailable"}</td><td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-slate-100">BDT {withdrawal.amount}</td><td className="px-4 py-4 whitespace-nowrap text-[11px] text-slate-400">{formatDate(withdrawal.createdAt)}</td><td className="px-4 py-4"><span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold " + statusClass(withdrawal.status)}>{withdrawal.status}</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelectedId(withdrawal.id)} className="text-xs font-semibold text-emerald-200 hover:text-blue-200">Review</button></td></tr>)}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4"><p className="text-xs text-slate-400">{result.total.toLocaleString()} requests · Page {result.page} of {Math.max(result.totalPages, 1)}</p><div className="flex gap-2"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:opacity-40">Previous</button><button type="button" aria-label="Next page" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:opacity-40">Next</button></div></div>
      </> : <div className="p-12 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-slate-400"><ArrowUpRight size={18}/></span><p className="mt-3 text-sm font-semibold text-slate-400">No withdrawal requests found</p><p className="mt-1 text-xs text-slate-400">Customer requests will appear here when submitted.</p></div>}
    </section>
    {selectedId && detail.data?.data.withdrawal && <WithdrawalDetails key={selectedId} withdrawal={detail.data.data.withdrawal} onClose={() => setSelectedId("")}/>}
    {selectedId && !detail.data && (detail.isError ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-[#10182b] p-5 shadow-xl"><div className="flex items-start justify-between"><h2 className="font-semibold text-slate-200">Withdrawal details unavailable</h2><button type="button" onClick={() => setSelectedId("")} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]">×</button></div><p className="mt-2 text-sm text-rose-200">{apiMessage(detail.error, "Could not load withdrawal details.")}</p></section></div> : <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="status" className="rounded-2xl bg-[#10182b] px-8 py-6 text-sm text-slate-400 shadow-xl">Loading withdrawal details…</section></div>)}
  </div>;
}
