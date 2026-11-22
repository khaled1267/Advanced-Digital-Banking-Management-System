"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  HandCoins,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiMessage, formatDate, inputClass } from "@/components/DepositPages";
import {
  MAX_LOAN_PAISA,
  MAX_LOAN_DURATION_MONTHS,
  MIN_LOAN_PAISA,
  MIN_LOAN_DURATION_MONTHS,
} from "@/lib/loan-limits";
import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";
import { useGetMyAccountsQuery } from "@/store/bankAccountsApi";
import {
  useApproveLoanMutation,
  useCreateLoanApplicationMutation,
  useCreateLoanRepaymentMutation,
  useDisburseLoanMutation,
  useForwardLoanToAdminMutation,
  useGetAdminLoanByIdQuery,
  useGetAdminLoanRepaymentsQuery,
  useGetAdminLoansQuery,
  useGetMyLoanByIdQuery,
  useGetMyLoanRepaymentsQuery,
  useGetMyLoansQuery,
  useGetMyLoanSummaryQuery,
  useGetStaffLoanByIdQuery,
  useGetStaffLoansQuery,
  useRejectLoanMutation,
  type LoanListQuery,
  type LoanRecord,
  type LoanRepaymentRecord,
  type LoanStatus,
} from "@/store/loansApi";
import type { BankAccount } from "@/store/bankAccountsApi";

const loanStatuses: LoanStatus[] = ["PENDING", "FORWARDED_TO_ADMIN", "APPROVED", "REJECTED", "DISBURSED", "PAID"];

function LoanStatusBadge({ status }: { status: LoanStatus }) {
  const color = status === "APPROVED" || status === "DISBURSED" || status === "PAID"
    ? "bg-emerald-400/10 text-emerald-200"
    : status === "PENDING"
      ? "bg-amber-400/10 text-amber-200"
      : status === "FORWARDED_TO_ADMIN"
        ? "bg-blue-400/10 text-blue-200"
        : "bg-rose-400/10 text-rose-200";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${color}`}>{status.replaceAll("_", " ")}</span>;
}

function LoanPageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-6"><p className="text-xs font-medium text-slate-400">{eyebrow}</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-100">{title}</h1><p className="mt-1 text-sm text-slate-400">{description}</p></div>;
}

function LoanSkeleton() {
  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b]" aria-label="Loading loan applications">
    <div className="animate-pulse space-y-4 p-5"><div className="h-4 w-40 rounded bg-white/[0.07]"/><div className="h-10 rounded-xl bg-white/[0.07]"/><div className="h-48 rounded-xl bg-white/[0.07]"/></div>
  </section>;
}

function LoanLoadError({ error, onRetry, title = "Could not load loan information" }: { error: unknown; onRetry: () => void; title?: string }) {
  const unauthorized = typeof error === "object" && error !== null && "status" in error && (error.status === 401 || error.status === 403);
  return <section className="rounded-2xl border border-rose-100 bg-[#10182b] p-8 text-center sm:p-10">
    <AlertCircle size={22} className="mx-auto text-rose-600"/>
    <h2 className="mt-3 text-sm font-semibold text-slate-200">{unauthorized ? "Access is not available" : title}</h2>
    <p role="alert" className="mt-1 text-xs text-rose-200">{apiMessage(error, unauthorized ? "Your account does not have permission to view this information." : "Please try again in a moment.")}</p>
    {!unauthorized && <button type="button" onClick={onRetry} className="mt-3 text-xs font-semibold text-emerald-200 hover:text-blue-200">Try again</button>}
  </section>;
}

function EmptyLoans({ customer = false }: { customer?: boolean }) {
  return <div className="p-10 text-center sm:p-12"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.07] text-slate-400"><FileText size={19}/></span><p className="mt-3 text-sm font-semibold text-slate-400">{customer ? "No loan applications yet" : "No loan applications found"}</p><p className="mt-1 text-xs text-slate-400">{customer ? "Applications you submit will appear here." : "Try changing the search or status filter."}</p></div>;
}

function Pagination({ page, totalPages, total, onPageChange, noun = "applications" }: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
    <p className="text-xs text-slate-400">{total.toLocaleString()} {noun} · Page {page} of {Math.max(totalPages, 1)}</p>
    <div className="flex gap-2">
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
      <button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
    </div>
  </div>;
}

function LoanTable({ loans, showCustomer, onSelect }: { loans: LoanRecord[]; showCustomer: boolean; onSelect: (loanId: string) => void }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[790px] text-left">
      <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400">
        <tr><th className="px-5 py-3.5 font-semibold">Application</th>{showCustomer && <th className="px-4 py-3.5 font-semibold">Customer</th>}<th className="px-4 py-3.5 font-semibold">Account</th><th className="px-4 py-3.5 font-semibold">Requested</th><th className="px-4 py-3.5 font-semibold">Duration</th><th className="px-4 py-3.5 font-semibold">Submitted</th><th className="px-4 py-3.5 font-semibold">Status</th><th className="px-5 py-3.5 text-right font-semibold">Details</th></tr>
      </thead>
      <tbody className="divide-y divide-white/[0.06]">
        {loans.map((loan) => <tr key={loan.id} className="align-top hover:bg-white/[0.035]">
          <td className="px-5 py-4"><p className="font-mono text-xs font-semibold text-slate-100">{loan.loanId}</p><p className="mt-1 max-w-56 truncate text-[11px] text-slate-400" title={loan.purpose}>{loan.purpose}</p>{loan.rejectionReason && <p className="mt-1 max-w-56 text-[10px] text-rose-200">Reason: {loan.rejectionReason}</p>}</td>
          {showCustomer && <td className="px-4 py-4"><p className="text-xs font-medium text-slate-200">{loan.customer?.name ?? "Unavailable"}</p><p className="mt-0.5 text-[10px] text-slate-400">{loan.customer?.email ?? ""}</p></td>}
          <td className="px-4 py-4"><p className="font-mono text-[11px] text-slate-400">{loan.account?.maskedAccountNumber ?? "Unavailable"}</p><p className="mt-1 text-[10px] text-slate-400">{loan.account?.accountType ?? "Account unavailable"}</p></td>
          <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-100">BDT {loan.amount}</td>
          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-400">{loan.durationMonths} months</td>
          <td className="whitespace-nowrap px-4 py-4 text-[11px] text-slate-400">{formatDate(loan.createdAt)}</td>
          <td className="px-4 py-4"><LoanStatusBadge status={loan.status}/></td>
          <td className="px-5 py-4 text-right"><button type="button" onClick={() => onSelect(loan.id)} className="text-xs font-semibold text-emerald-200 hover:text-blue-200">View</button></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function LoanFilters({ status, onStatusChange, search, onSearch, onApplySearch }: {
  status: string;
  onStatusChange: (status: string) => void;
  search?: string;
  onSearch?: (search: string) => void;
  onApplySearch?: () => void;
}) {
  return <div className="grid gap-3 border-b border-white/[0.06] p-4 sm:grid-cols-2 sm:p-5">
    {onSearch && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onApplySearch?.(); }}>
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search by loan reference</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-9`} placeholder="Search loan reference" value={search ?? ""} onChange={(event) => onSearch(event.target.value)}/></label>
      <button type="submit" className="rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white">Search</button>
    </form>}
    <label className="block"><span className="sr-only">Filter loans by status</span><select className={inputClass} value={status} onChange={(event) => onStatusChange(event.target.value)}><option value="">All statuses</option>{loanStatuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
  </div>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-200">{value}</dd></div>;
}

function ConfirmDialog({ title, description, confirmLabel, isLoading, error, onConfirm, onCancel }: {
  title: string;
  description: string;
  confirmLabel: string;
  isLoading: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isLoading) onCancel(); }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="loan-confirm-title" className="w-full max-w-md rounded-2xl bg-[#10182b] p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200">Confirm action</p><h3 id="loan-confirm-title" className="mt-1 text-lg font-semibold text-slate-100">{title}</h3></div><button type="button" disabled={isLoading} onClick={onCancel} aria-label="Close confirmation" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07] disabled:opacity-50"><X size={18}/></button></div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-400/10 px-3.5 py-2.5 text-xs text-rose-200">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={isLoading} onClick={onCancel} className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs font-semibold text-slate-400 disabled:opacity-50">Cancel</button><button type="button" disabled={isLoading} onClick={onConfirm} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{isLoading ? "Processing…" : confirmLabel}</button></div>
    </section>
  </div>;
}

function RepaymentHistory({ repayments, isLoading, isError, error, onRetry, page, total, totalPages, onPageChange, showCustomer = false }: {
  repayments?: LoanRepaymentRecord[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showCustomer?: boolean;
}) {
  return <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b]">
    <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5"><h3 className="text-sm font-semibold text-slate-100">Repayment history</h3><p className="mt-1 text-xs text-slate-400">Completed repayments and their transaction references.</p></div>
    {isLoading ? <div role="status" className="p-5"><div className="animate-pulse space-y-3"><div className="h-4 w-36 rounded bg-white/[0.07]"/><div className="h-16 rounded-xl bg-white/[0.07]"/></div></div>
      : isError ? <div className="p-5"><p role="alert" className="text-xs text-rose-200">{apiMessage(error, "Could not load repayment history.")}</p><button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold text-emerald-200">Try again</button></div>
        : repayments?.length ? <>
          <div className="divide-y divide-white/[0.06] md:hidden">{repayments.map((repayment) => <article key={repayment.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold text-slate-100">{repayment.repaymentId}</p>{showCustomer && <p className="mt-1 text-[11px] text-slate-400">{repayment.customer?.name ?? "Customer unavailable"}</p>}</div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">{repayment.status}</span></div>
            <p className="text-sm font-semibold text-slate-100">{repayment.currency} {repayment.amount}</p><p className="text-[11px] text-slate-400">From {repayment.sourceAccount?.maskedAccountNumber ?? "Unavailable"} · {formatDate(repayment.createdAt)}</p><p className="break-all font-mono text-[10px] text-slate-400">{repayment.transaction?.transactionId ?? "Transaction unavailable"}</p>
          </article>)}</div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Repayment</th>{showCustomer && <th className="px-4 py-3">Customer</th>}<th className="px-4 py-3">Amount</th><th className="px-4 py-3">Source account</th><th className="px-4 py-3">Transaction</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{repayments.map((repayment) => <tr key={repayment.id}><td className="px-5 py-3 font-mono font-semibold text-slate-100">{repayment.repaymentId}</td>{showCustomer && <td className="px-4 py-3">{repayment.customer?.name ?? "Unavailable"}</td>}<td className="px-4 py-3 whitespace-nowrap">{repayment.currency} {repayment.amount}</td><td className="px-4 py-3 font-mono">{repayment.sourceAccount?.maskedAccountNumber ?? "Unavailable"}</td><td className="px-4 py-3 font-mono">{repayment.transaction?.transactionId ?? "Unavailable"}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(repayment.createdAt)}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">{repayment.status}</span></td></tr>)}</tbody></table></div>
          <Pagination page={page} total={total} totalPages={totalPages} onPageChange={onPageChange} noun="repayments"/>
        </> : <div className="p-8 text-center"><p className="text-sm font-semibold text-slate-400">No repayments yet</p><p className="mt-1 text-xs text-slate-400">Completed repayment records will appear here.</p></div>}
  </section>;
}

function CustomerLoanDetailDialog({ loan, accounts, accountsLoading, accountsError }: {
  loan: LoanRecord;
  accounts: BankAccount[];
  accountsLoading: boolean;
  accountsError: unknown;
}) {
  const [historyPage, setHistoryPage] = useState(1);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmation, setConfirmation] = useState<{ amount: string; sourceAccountId: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const canShowHistory = loan.status === "DISBURSED" || loan.status === "PAID";
  const history = useGetMyLoanRepaymentsQuery(
    { id: loan.id, page: historyPage, limit: 5 },
    { skip: !canShowHistory },
  );
  const [createRepayment, repaymentState] = useCreateLoanRepaymentMutation();
  const activeAccounts = accounts.filter((account) => account.status === "ACTIVE" && account.currency === "BDT");
  const sourceAccount = activeAccounts.find((account) => account.id === sourceAccountId);
  const amountPaisa = parseBdtPaisa(amount.trim());
  const outstandingPaisa = parseBdtPaisa(loan.outstandingBalance ?? (loan.status === "DISBURSED" ? loan.approvedAmount ?? "" : ""));
  const accountBalancePaisa = sourceAccount ? parseBdtPaisa(sourceAccount.balance) : null;
  const validAmount = amountPaisa !== null && amountPaisa > BigInt("0") && outstandingPaisa !== null && amountPaisa <= outstandingPaisa && accountBalancePaisa !== null && amountPaisa <= accountBalancePaisa;

  async function confirmRepayment() {
    if (!confirmation) return;
    const payload = confirmation;
    const fingerprint = `${loan.id}:${payload.sourceAccountId}:${payload.amount.trim()}`;
    if (!pendingRequest.current || pendingRequest.current.fingerprint !== fingerprint) {
      pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
    }
    setFeedback("");
    try {
      const response = await createRepayment({
        id: loan.id,
        amount: payload.amount.trim(),
        sourceAccountId: payload.sourceAccountId,
        idempotencyKey: pendingRequest.current.key,
      }).unwrap();
      pendingRequest.current = null;
      setConfirmation(null);
      setAmount("");
      const label = response.data.replayed ? "This repayment was already completed." : "Repayment completed successfully.";
      setFeedback(`${label} Reference ${response.data.repayment.repaymentId}; transaction ${response.data.repayment.transaction?.transactionId ?? "unavailable"}.`);
      setFeedbackError(false);
    } catch (error: unknown) {
      setFeedback(apiMessage(error, "Could not confirm the repayment. If the network timed out, retry this exact request to safely check its result."));
      setFeedbackError(true);
    }
  }

  const requestedPaisa = parseBdtPaisa(loan.approvedAmount ?? loan.amount);
  const paidPaisa = requestedPaisa !== null && outstandingPaisa !== null && requestedPaisa >= outstandingPaisa
    ? requestedPaisa - outstandingPaisa
    : BigInt("0");
  const progressPercent = requestedPaisa !== null && requestedPaisa > BigInt("0")
    ? Number((paidPaisa * BigInt("10000")) / requestedPaisa) / 100
    : 0;
  const historyData = history.data?.data;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !repaymentState.isLoading) setConfirmation(null); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="customer-loan-title" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[#f7f9fc] p-4 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200">Loan details</p><h2 id="customer-loan-title" className="mt-1 break-all font-mono text-lg font-semibold text-slate-100">{loan.loanId}</h2></div><button type="button" onClick={() => setConfirmation(null)} aria-label="Close loan details" className="rounded-lg p-2 text-slate-400 hover:bg-[#10182b]"><X size={18}/></button></div>
      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Requested amount</p><p className="mt-1 text-2xl font-semibold text-slate-100">BDT {loan.amount}</p></div><LoanStatusBadge status={loan.status}/></div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><DetailField label="Approved amount" value={loan.approvedAmount ? `BDT ${loan.approvedAmount}` : "Not approved"}/><DetailField label="Duration" value={`${loan.durationMonths} months`}/><DetailField label="Application date" value={formatDate(loan.createdAt)}/><DetailField label="Approval date" value={loan.approvedAt ? formatDate(loan.approvedAt) : "Not approved"}/><DetailField label="Rejection reason" value={loan.rejectionReason ?? "—"}/><DetailField label="Disbursement date" value={loan.disbursedAt ? formatDate(loan.disbursedAt) : "Not disbursed"}/><DetailField label="Disbursement transaction" value={loan.disbursement?.transactionId ?? "—"}/><DetailField label="Outstanding balance" value={loan.outstandingBalance !== null ? `BDT ${loan.outstandingBalance}` : "—"}/><DetailField label="Receiving account" value={loan.account?.maskedAccountNumber ?? "Unavailable"}/></dl>
        <div className="mt-5"><div className="flex justify-between text-[10px] text-slate-400"><span>Repayment progress</span><span>{progressPercent.toFixed(2)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-emerald-400/100 transition-all" style={{ width: `${Math.min(progressPercent, 100)}%` }}/></div><p className="mt-1 text-[10px] text-slate-400">Paid BDT {formatBdtPaisa(paidPaisa)} of BDT {formatBdtPaisa(requestedPaisa ?? BigInt("0"))}</p></div>
      </section>

      {loan.status === "DISBURSED" && <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 sm:p-5"><div className="flex items-start gap-2"><HandCoins size={17} className="mt-0.5 text-emerald-200"/><div><h3 className="text-sm font-semibold text-slate-100">Make a repayment</h3><p className="mt-1 text-xs text-slate-400">Choose your active BDT account. The server will recheck its balance and the loan balance before processing.</p></div></div>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (validAmount && sourceAccount) setConfirmation({ amount: amount.trim(), sourceAccountId }); }}>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Source account</span><select className={inputClass} value={sourceAccountId} onChange={(event) => { setSourceAccountId(event.target.value); setFeedback(""); setFeedbackError(false); }} disabled={accountsLoading || activeAccounts.length === 0}><option value="">Choose an active account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountType} · {account.accountNumber} · BDT {account.balance}</option>)}</select>{accountsLoading && <span role="status" className="mt-1 block text-[10px] text-slate-400">Loading accounts…</span>}{Boolean(accountsError) && <span role="alert" className="mt-1 block text-[10px] text-rose-200">{apiMessage(accountsError, "Could not load your accounts.")}</span>}{!accountsLoading && !accountsError && activeAccounts.length === 0 && <span className="mt-1 block text-[10px] text-amber-200">You need an active BDT account to repay.</span>}{sourceAccount && <span className="mt-1 block text-[10px] text-slate-400">Available balance: BDT {sourceAccount.balance}</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Repayment amount (BDT)</span><input className={inputClass} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => { setAmount(event.target.value); setFeedback(""); setFeedbackError(false); }} aria-describedby="repayment-amount-hint"/><span id="repayment-amount-hint" className="mt-1 block text-[10px] text-slate-400">Outstanding: BDT {loan.outstandingBalance ?? loan.approvedAmount ?? "—"}</span>{amount.trim() && amountPaisa === null && <span role="alert" className="mt-1 block text-[10px] text-rose-200">Enter a positive amount with at most two decimal places.</span>}{amountPaisa !== null && amountPaisa > BigInt("0") && outstandingPaisa !== null && amountPaisa > outstandingPaisa && <span role="alert" className="mt-1 block text-[10px] text-rose-200">Repayment cannot exceed the outstanding balance.</span>}{amountPaisa !== null && amountPaisa > BigInt("0") && accountBalancePaisa !== null && amountPaisa > accountBalancePaisa && <span role="alert" className="mt-1 block text-[10px] text-rose-200">The selected account does not have enough balance.</span>}</label>
          {feedback && <p role={feedbackError ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-xs sm:col-span-2 ${feedbackError ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>{feedback}</p>}
          <div className="flex items-center justify-between gap-3 sm:col-span-2"><p className="text-[10px] text-slate-400">Repayment requests use a retry-safe request key.</p><button type="submit" disabled={!validAmount || !sourceAccount || repaymentState.isLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Review repayment</button></div>
        </form>
      </section>}

      {loan.status === "PAID" && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-400/10 p-4"><CheckCircle2 size={17} className="mt-0.5 text-emerald-200"/><div><p className="text-sm font-semibold text-emerald-900">Loan fully repaid</p><p className="mt-1 text-xs text-emerald-200">Your repayment actions are disabled. You can review the completed repayment history below.</p></div></div>}

      {canShowHistory && <RepaymentHistory repayments={historyData?.repayments} isLoading={history.isLoading} isError={history.isError} error={history.error} onRetry={() => void history.refetch()} page={historyData?.page ?? historyPage} total={historyData?.total ?? 0} totalPages={historyData?.totalPages ?? 0} onPageChange={setHistoryPage}/>}
      <div className="mt-4 flex justify-end"><button type="button" onClick={() => setConfirmation(null)} className="rounded-xl border border-white/[0.08] bg-[#10182b] px-4 py-2.5 text-xs font-semibold text-slate-400">Close</button></div>
      {confirmation && <ConfirmDialog title="Confirm loan repayment" description={`Pay BDT ${confirmation.amount} from ${sourceAccount?.accountNumber ?? "the selected account"} toward loan ${loan.loanId}? Outstanding balance: BDT ${loan.outstandingBalance ?? loan.approvedAmount ?? "—"}.`} confirmLabel={feedbackError ? "Retry same request" : "Confirm repayment"} isLoading={repaymentState.isLoading} error={feedbackError ? feedback : undefined} onConfirm={() => void confirmRepayment()} onCancel={() => setConfirmation(null)}/>}
    </section>
  </div>;
}

export function CustomerLoansPage() {
  const { data: accountsResponse, isLoading: accountsLoading, isError: accountsError, error: accountsErrorValue, refetch: refetchAccounts } = useGetMyAccountsQuery();
  const accounts = accountsResponse?.data.accounts ?? [];
  const activeAccounts = accounts.filter((account) => account.status === "ACTIVE" && account.currency === "BDT");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [durationMonths, setDurationMonths] = useState(12);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [createLoan, createState] = useCreateLoanApplicationMutation();
  const summary = useGetMyLoanSummaryQuery();
  const query = useGetMyLoansQuery({ status: statusFilter ? statusFilter as LoanStatus : undefined, page, limit: 8 });
  const detail = useGetMyLoanByIdQuery(selectedId, { skip: !selectedId });
  const result = query.data?.data;
  const amountPaisa = parseBdtPaisa(amount.trim());
  const validAmount = amountPaisa !== null && amountPaisa >= MIN_LOAN_PAISA && amountPaisa <= MAX_LOAN_PAISA;
  const validPurpose = purpose.trim().length >= 10 && purpose.trim().length <= 500;
  const activeAccount = activeAccounts.some((account) => account.id === accountId);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || !validAmount || !validPurpose) return;
    setFeedback("");
    try {
      const response = await createLoan({ accountId, amount: amount.trim(), purpose: purpose.trim(), durationMonths }).unwrap();
      setFeedback(`Application ${response.data.loan.loanId} was submitted successfully.`);
      setFeedbackError(false);
      setAmount("");
      setPurpose("");
    } catch (error: unknown) {
      setFeedback(apiMessage(error, "Could not submit your loan application."));
      setFeedbackError(true);
    }
  }

  const summaryCards = [
    { label: "Total loans", value: summary.data?.data.totalLoans.toLocaleString() ?? "—" },
    { label: "Pending", value: summary.data?.data.pendingLoans.toLocaleString() ?? "—" },
    { label: "Approved", value: summary.data?.data.approvedLoans.toLocaleString() ?? "—" },
    { label: "Disbursed", value: summary.data?.data.disbursedLoans.toLocaleString() ?? "—" },
    { label: "Outstanding", value: summary.data ? `BDT ${summary.data.data.outstandingBalance}` : "—" },
    { label: "Paid", value: summary.data?.data.paidLoans.toLocaleString() ?? "—" },
  ];

  return <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <LoanPageHeading eyebrow="Personal banking" title="My loans" description="Apply for a loan, follow its progress and make repayments on disbursed loans."/>
    {summary.isLoading ? <div role="status" aria-label="Loading loan summary" className="mb-5 grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-[#10182b]"/>)}</div>
      : summary.isError ? <div className="mb-5"><LoanLoadError title="Could not load loan overview" error={summary.error} onRetry={() => void summary.refetch()}/></div>
        : <section aria-label="Loan overview" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{summaryCards.map((card) => <article key={card.label} className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 shadow-sm"><p className="text-[10px] font-medium text-slate-400">{card.label}</p><p className="mt-3 break-words text-xl font-semibold tracking-tight text-slate-100">{card.value}</p></article>)}</section>}
    <div className="grid items-start gap-5 xl:grid-cols-[0.86fr_1.14fr]">
      <section className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10 text-blue-200"><HandCoins size={19}/></span><div><h2 className="text-sm font-semibold text-slate-100">New loan application</h2><p className="mt-1 text-xs text-slate-400">BDT 10,000–5,000,000 · 6–60 months</p></div></div>
        <form onSubmit={submitApplication} className="mt-5 space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Your active BDT account</span><select className={inputClass} value={accountId} onChange={(event) => { setAccountId(event.target.value); setFeedback(""); }} disabled={accountsLoading || accountsError || activeAccounts.length === 0}><option value="">Choose an account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountType} · {account.accountNumber} · BDT {account.balance}</option>)}</select>{accountsLoading && <span role="status" className="mt-1 block text-[10px] text-slate-400">Loading your accounts…</span>}{accountsError && <span role="alert" className="mt-1 block text-[10px] text-rose-200">{apiMessage(accountsErrorValue, "Could not load your accounts.")} <button type="button" onClick={() => void refetchAccounts()} className="font-semibold underline">Try again</button></span>}{!accountsLoading && !accountsError && activeAccounts.length === 0 && <span className="mt-1 block text-[10px] text-amber-200">You need an active BDT account before applying.</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Requested amount (BDT)</span><input className={inputClass} inputMode="decimal" autoComplete="off" placeholder="10000.00" value={amount} onChange={(event) => { setAmount(event.target.value); setFeedback(""); }}/><span className="mt-1 block text-[10px] text-slate-400">Minimum BDT 10,000.00 · Maximum BDT 5,000,000.00</span>{amount.trim() && !validAmount && <span role="alert" className="mt-1 block text-[10px] text-rose-200">Enter an amount in the allowed range with at most two decimal places.</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Loan purpose</span><textarea className={`${inputClass} min-h-24 resize-y`} maxLength={500} placeholder="Describe what you plan to use this loan for" value={purpose} onChange={(event) => { setPurpose(event.target.value); setFeedback(""); }}/><span className="mt-1 flex justify-between text-[10px] text-slate-400"><span>Enter 10–500 characters.</span><span>{purpose.length}/500</span></span>{purpose.length > 0 && !validPurpose && <span role="alert" className="mt-1 block text-[10px] text-rose-200">Purpose must be between 10 and 500 characters.</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Duration</span><select className={inputClass} value={durationMonths} onChange={(event) => setDurationMonths(Number(event.target.value))}>{Array.from({ length: (MAX_LOAN_DURATION_MONTHS - MIN_LOAN_DURATION_MONTHS) / 6 + 1 }, (_, index) => MIN_LOAN_DURATION_MONTHS + index * 6).map((months) => <option key={months} value={months}>{months} months</option>)}</select><span className="mt-1 block text-[10px] text-slate-400">Choose between {MIN_LOAN_DURATION_MONTHS} and {MAX_LOAN_DURATION_MONTHS} months.</span></label>
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3.5"><div className="flex items-start gap-2.5"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-200"/><p className="text-xs leading-5 text-blue-100">This submits an application for review. It does not change your account balance.</p></div></div>
          {feedback && <p role={feedbackError ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-xs ${feedbackError ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>{feedback}</p>}
          <button type="submit" disabled={!activeAccount || !validAmount || !validPurpose || createState.isLoading} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1b3a60] disabled:cursor-not-allowed disabled:opacity-45">{createState.isLoading ? "Submitting application…" : "Submit application"}</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-5"><div><h2 className="text-sm font-semibold text-slate-100">Application history</h2><p className="mt-1 text-xs text-slate-400">Your applications and their latest status.</p></div><select aria-label="Filter my applications by status" className={`${inputClass} w-full sm:w-52`} value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option>{loanStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        {query.isLoading ? <div className="p-5"><LoanSkeleton/></div> : query.isError ? <div className="p-5"><LoanLoadError error={query.error} onRetry={() => void query.refetch()}/></div> : result?.loans.length ? <><LoanTable loans={result.loans} showCustomer={false} onSelect={setSelectedId}/><Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage}/></> : <EmptyLoans customer/>}
      </section>
    </div>
    {selectedId && (detail.data?.data.loan
      ? <CustomerLoanDetailDialog key={selectedId} loan={detail.data.data.loan} accounts={accounts} accountsLoading={accountsLoading} accountsError={accountsError ? accountsErrorValue : undefined}/>
      : detail.isError
        ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="alertdialog" className="w-full max-w-sm rounded-2xl bg-[#10182b] p-5"><div className="flex justify-between"><h2 className="font-semibold text-slate-200">Loan details unavailable</h2><button type="button" aria-label="Close" onClick={() => setSelectedId("")}><X size={18}/></button></div><p role="alert" className="mt-3 text-sm text-rose-200">{apiMessage(detail.error, "Could not load loan details.")}</p></section></div>
        : <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="status" className="rounded-2xl bg-[#10182b] px-8 py-6 text-sm text-slate-400">Loading loan details…</section></div>)}
  </div>;
}

type PendingAdminAction =
  | { type: "approve"; approvedAmount: string }
  | { type: "reject"; rejectionReason: string }
  | { type: "disburse" };

function LoanDetailsDialog({ loan, mode, onClose, onForward, onApprove, onReject, onDisburse, isForwarding, isAdminActionLoading, actionError, actionSuccess, repaymentHistory, repaymentHistoryLoading, repaymentHistoryError, onRetryRepaymentHistory, onHistoryPageChange }: {
  loan: LoanRecord;
  mode: "staff" | "admin";
  onClose: () => void;
  onForward?: (reviewNotes: string) => Promise<boolean>;
  onApprove?: (approvedAmount: string) => Promise<boolean>;
  onReject?: (rejectionReason: string) => Promise<boolean>;
  onDisburse?: () => Promise<boolean>;
  isForwarding: boolean;
  isAdminActionLoading: boolean;
  actionError: string;
  actionSuccess: string;
  repaymentHistory?: { repayments: LoanRepaymentRecord[]; total: number; page: number; totalPages: number };
  repaymentHistoryLoading: boolean;
  repaymentHistoryError?: unknown;
  onRetryRepaymentHistory: () => void;
  onHistoryPageChange?: (page: number) => void;
}) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [notesError, setNotesError] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmAction, setConfirmAction] = useState<PendingAdminAction | null>(null);
  const requestedPaisa = parseBdtPaisa(loan.amount);
  const approvedPaisa = parseBdtPaisa(approvedAmount.trim());
  const validApprovedAmount = approvedPaisa !== null && approvedPaisa > BigInt("0") && requestedPaisa !== null && approvedPaisa <= requestedPaisa;

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = reviewNotes.trim();
    if (cleaned.length < 5 || cleaned.length > 1000) {
      setNotesError("Review notes must be between 5 and 1,000 characters.");
      return;
    }
    setNotesError("");
    if (onForward && await onForward(cleaned)) setReviewNotes("");
  }

  async function confirmAdminAction() {
    if (!confirmAction) return;
    let completed = false;
    if (confirmAction.type === "approve") completed = Boolean(onApprove && await onApprove(confirmAction.approvedAmount));
    if (confirmAction.type === "reject") completed = Boolean(onReject && await onReject(confirmAction.rejectionReason));
    if (confirmAction.type === "disburse") completed = Boolean(onDisburse && await onDisburse());
    if (completed) setConfirmAction(null);
  }

  const confirmDescription = confirmAction?.type === "approve"
    ? `Approve BDT ${confirmAction.approvedAmount} for ${loan.loanId}? The requested amount is BDT ${loan.amount}.`
    : confirmAction?.type === "reject"
      ? `Reject ${loan.loanId} with the reason: ${confirmAction.rejectionReason}`
      : confirmAction?.type === "disburse"
        ? `Disburse BDT ${loan.approvedAmount ?? "—"} to ${loan.account?.maskedAccountNumber ?? "the linked account"}?`
        : "";

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !isForwarding && !isAdminActionLoading) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="loan-detail-title" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[#f7f9fc] p-4 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200">Loan application</p><h2 id="loan-detail-title" className="mt-1 break-all font-mono text-lg font-semibold text-slate-100">{loan.loanId}</h2></div><button type="button" onClick={onClose} aria-label="Close loan details" className="rounded-lg p-2 text-slate-400 hover:bg-[#10182b]"><X size={18}/></button></div>
      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Requested amount</p><p className="mt-1 text-2xl font-semibold text-slate-100">BDT {loan.amount}</p></div><LoanStatusBadge status={loan.status}/></div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mode === "admin" && <><DetailField label="Customer" value={loan.customer?.name ?? "Unavailable"}/><DetailField label="Customer email" value={loan.customer?.email ?? "Unavailable"}/></>}
          <DetailField label="Account" value={`${loan.account?.maskedAccountNumber ?? "Unavailable"} · ${loan.account?.accountType ?? ""}`}/><DetailField label="Account status" value={loan.account?.status ?? "Unavailable"}/><DetailField label="Approved amount" value={loan.approvedAmount ? `BDT ${loan.approvedAmount}` : "Not approved"}/><DetailField label="Outstanding balance" value={loan.outstandingBalance !== null ? `BDT ${loan.outstandingBalance}` : "—"}/><DetailField label="Duration" value={`${loan.durationMonths} months`}/><DetailField label="Submitted" value={formatDate(loan.createdAt)}/><DetailField label="Approved" value={loan.approvedAt ? formatDate(loan.approvedAt) : "—"}/><DetailField label="Disbursed" value={loan.disbursedAt ? formatDate(loan.disbursedAt) : "—"}/><DetailField label="Disbursement transaction" value={loan.disbursement?.transactionId ?? "—"}/><DetailField label="Staff reviewer" value={loan.reviewer ? `${loan.reviewer.name} · ${loan.reviewer.email}` : "—"}/>
          <div className="sm:col-span-2 lg:col-span-3"><DetailField label="Purpose" value={loan.purpose}/></div>
          {loan.reviewNotes && <div className="sm:col-span-2 lg:col-span-3"><DetailField label="Staff review notes" value={loan.reviewNotes}/></div>}
          {loan.rejectionReason && <div className="sm:col-span-2 lg:col-span-3"><DetailField label="Rejection reason" value={loan.rejectionReason}/></div>}
        </dl>
      </section>

      {actionSuccess && <p role="status" className="mt-4 rounded-xl bg-emerald-400/10 px-3.5 py-2.5 text-xs text-emerald-200">{actionSuccess}</p>}
      {mode === "staff" && loan.status === "PENDING" && <form onSubmit={submitReview} className="mt-4 rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 sm:p-5">
        <label htmlFor="loan-review-notes" className="mb-1.5 block text-xs font-semibold text-slate-400">Staff review notes</label><textarea id="loan-review-notes" className={`${inputClass} min-h-24 resize-y`} minLength={5} maxLength={1000} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Summarize your review for the Admin"/><p className="mt-1 text-right text-[10px] text-slate-400">{reviewNotes.length}/1000</p>
        {notesError && <p role="alert" className="mt-2 text-xs text-rose-200">{notesError}</p>}{actionError && <p role="alert" className="mt-2 text-xs text-rose-200">{actionError}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-slate-400">Only Admin can approve, reject or disburse.</p><button type="submit" disabled={isForwarding || reviewNotes.trim().length < 5} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{isForwarding ? "Forwarding…" : "Forward to Admin"}<ArrowRight size={14}/></button></div>
      </form>}

      {mode === "admin" && loan.status === "FORWARDED_TO_ADMIN" && <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <form className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); if (!validApprovedAmount) { setFormError("Approved amount must be positive and cannot exceed the requested amount."); return; } setFormError(""); setConfirmAction({ type: "approve", approvedAmount: formatBdtPaisa(approvedPaisa!) }); }}>
          <h3 className="text-sm font-semibold text-slate-100">Approve application</h3><p className="mt-1 text-xs text-slate-400">Requested: BDT {loan.amount}. Enter the approved amount explicitly.</p>
          <label className="mt-4 block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Approved amount (BDT)</span><input className={inputClass} inputMode="decimal" autoComplete="off" placeholder="Enter approved amount" value={approvedAmount} onChange={(event) => { setApprovedAmount(event.target.value); setFormError(""); }}/></label>
          {approvedAmount && !validApprovedAmount && <p role="alert" className="mt-2 text-[11px] text-rose-200">Enter a positive amount no greater than BDT {loan.amount}, with at most two decimals.</p>}{formError && <p role="alert" className="mt-2 text-[11px] text-rose-200">{formError}</p>}
          <button type="submit" disabled={!validApprovedAmount || isAdminActionLoading} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-45">Review approval</button>
        </form>
        <form className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); const reason = rejectionReason.trim(); if (reason.length < 5 || reason.length > 300) { setFormError("Rejection reason must be between 5 and 300 characters."); return; } setFormError(""); setConfirmAction({ type: "reject", rejectionReason: reason }); }}>
          <h3 className="text-sm font-semibold text-slate-100">Reject application</h3><p className="mt-1 text-xs text-slate-400">A clear reason will be saved with the loan application.</p>
          <label className="mt-4 block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Rejection reason</span><textarea className={`${inputClass} min-h-24 resize-y`} minLength={5} maxLength={300} value={rejectionReason} onChange={(event) => { setRejectionReason(event.target.value); setFormError(""); }} placeholder="Explain the decision"/><span className="mt-1 block text-right text-[10px] text-slate-400">{rejectionReason.length}/300</span></label>
          {formError && <p role="alert" className="mt-2 text-[11px] text-rose-200">{formError}</p>}<button type="submit" disabled={rejectionReason.trim().length < 5 || rejectionReason.trim().length > 300 || isAdminActionLoading} className="mt-4 w-full rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-45">Review rejection</button>
        </form>
        {actionError && <p role="alert" className="rounded-xl bg-rose-400/10 px-3.5 py-2.5 text-xs text-rose-200 lg:col-span-2">{actionError}</p>}
      </section>}

      {mode === "admin" && loan.status === "APPROVED" && <section className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 sm:p-5"><div className="flex items-start gap-2"><ShieldCheck size={17} className="mt-0.5 text-blue-200"/><div><h3 className="text-sm font-semibold text-blue-200">Ready for disbursement</h3><p className="mt-1 text-xs text-blue-100">Approved amount: BDT {loan.approvedAmount ?? "Unavailable"} · Linked account: {loan.account?.maskedAccountNumber ?? "Unavailable"} ({loan.account?.status ?? "status unavailable"})</p></div></div>{actionError && <p role="alert" className="mt-3 text-xs text-rose-200">{actionError}</p>}<button type="button" onClick={() => setConfirmAction({ type: "disburse" })} disabled={!loan.approvedAmount || isAdminActionLoading} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-45">Disburse approved amount</button></section>}

      {mode === "admin" && <RepaymentHistory repayments={repaymentHistory?.repayments} isLoading={repaymentHistoryLoading} isError={Boolean(repaymentHistoryError)} error={repaymentHistoryError} onRetry={onRetryRepaymentHistory} page={repaymentHistory?.page ?? 1} total={repaymentHistory?.total ?? 0} totalPages={repaymentHistory?.totalPages ?? 0} onPageChange={(value) => onHistoryPageChange?.(value)} showCustomer/>}
      <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-xl border border-white/[0.08] bg-[#10182b] px-4 py-2.5 text-xs font-semibold text-slate-400">Close details</button></div>
      {confirmAction && <ConfirmDialog title={confirmAction.type === "approve" ? "Confirm approval" : confirmAction.type === "reject" ? "Confirm rejection" : "Confirm disbursement"} description={confirmDescription} confirmLabel={confirmAction.type === "approve" ? "Approve loan" : confirmAction.type === "reject" ? "Reject loan" : "Disburse loan"} isLoading={isAdminActionLoading} error={actionError} onConfirm={() => void confirmAdminAction()} onCancel={() => setConfirmAction(null)}/>}
    </section>
  </div>;
}

function LoanDetailOverlay({ loan, loading, error, ...props }: {
  loan?: LoanRecord;
  loading: boolean;
  error?: unknown;
  mode: "staff" | "admin";
  onClose: () => void;
  onForward?: (reviewNotes: string) => Promise<boolean>;
  onApprove?: (approvedAmount: string) => Promise<boolean>;
  onReject?: (rejectionReason: string) => Promise<boolean>;
  onDisburse?: () => Promise<boolean>;
  isForwarding: boolean;
  isAdminActionLoading: boolean;
  actionError: string;
  actionSuccess: string;
  repaymentHistory?: { repayments: LoanRepaymentRecord[]; total: number; page: number; totalPages: number };
  repaymentHistoryLoading: boolean;
  repaymentHistoryError?: unknown;
  onRetryRepaymentHistory: () => void;
  onHistoryPageChange?: (page: number) => void;
}) {
  if (loan) return <LoanDetailsDialog loan={loan} {...props}/>;
  if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="status" className="rounded-2xl bg-[#10182b] px-8 py-6 text-sm text-slate-400">Loading application details…</section></div>;
  if (error) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-[#10182b] p-5 shadow-xl"><div className="flex items-start justify-between"><h2 className="font-semibold text-slate-200">Application details unavailable</h2><button type="button" onClick={props.onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]"><X size={17}/></button></div><p role="alert" className="mt-2 text-sm text-rose-200">{apiMessage(error, "Could not load loan details.")}</p></section></div>;
  return null;
}

function LoanQueuePage({ mode }: { mode: "staff" | "admin" }) {
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(mode === "staff" ? "PENDING" : "");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const query: LoanListQuery = { search: search.trim() || undefined, status: status ? status as LoanStatus : undefined, page, limit: 10 };
  const staffQuery = useGetStaffLoansQuery(query, { skip: mode !== "staff" });
  const adminQuery = useGetAdminLoansQuery(query, { skip: mode !== "admin" });
  const detail = useGetStaffLoanByIdQuery(selectedId, { skip: !selectedId || mode !== "staff" });
  const adminDetail = useGetAdminLoanByIdQuery(selectedId, { skip: !selectedId || mode !== "admin" });
  const adminHistory = useGetAdminLoanRepaymentsQuery({ id: selectedId, page: historyPage, limit: 10 }, { skip: !selectedId || mode !== "admin" });
  const [forwardLoan, forwardState] = useForwardLoanToAdminMutation();
  const [approveLoan, approveState] = useApproveLoanMutation();
  const [rejectLoan, rejectState] = useRejectLoanMutation();
  const [disburseLoan, disburseState] = useDisburseLoanMutation();
  const list = mode === "staff" ? staffQuery : adminQuery;
  const detailQuery = mode === "staff" ? detail : adminDetail;
  const result = list.data?.data;
  const selectedLoan = detailQuery.data?.data.loan;
  const isAdminActionLoading = approveState.isLoading || rejectState.isLoading || disburseState.isLoading;

  function updateStatus(value: string) { setStatus(value); setPage(1); }
  function applySearch() { setSearch(draftSearch.trim()); setPage(1); }

  async function handleForward(reviewNotes: string) {
    if (!selectedId) return false;
    setActionError(""); setActionSuccess("");
    try { await forwardLoan({ id: selectedId, action: "FORWARD_TO_ADMIN", reviewNotes }).unwrap(); setActionSuccess("Application forwarded to Admin."); return true; }
    catch (error: unknown) { setActionError(apiMessage(error, "Could not forward this application.")); return false; }
  }
  async function handleApprove(approvedAmount: string) {
    if (!selectedId) return false;
    setActionError(""); setActionSuccess("");
    try { await approveLoan({ id: selectedId, approvedAmount }).unwrap(); setActionSuccess(`Loan approved for BDT ${approvedAmount}.`); return true; }
    catch (error: unknown) { setActionError(apiMessage(error, "Could not approve this loan.")); return false; }
  }
  async function handleReject(rejectionReason: string) {
    if (!selectedId) return false;
    setActionError(""); setActionSuccess("");
    try { await rejectLoan({ id: selectedId, rejectionReason }).unwrap(); setActionSuccess("Loan application rejected."); return true; }
    catch (error: unknown) { setActionError(apiMessage(error, "Could not reject this loan.")); return false; }
  }
  async function handleDisburse() {
    if (!selectedId) return false;
    setActionError(""); setActionSuccess("");
    try { const response = await disburseLoan({ id: selectedId }).unwrap(); setActionSuccess(`Disbursed BDT ${response.data.transaction.amount}. Transaction ${response.data.transaction.transactionId}.`); return true; }
    catch (error: unknown) { setActionError(apiMessage(error, "Could not disburse this loan.")); return false; }
  }

  return <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <LoanPageHeading eyebrow={mode === "staff" ? "Branch operations" : "Administration"} title={mode === "staff" ? "Loan assistance" : "Loan management"} description={mode === "staff" ? "Review customer applications and forward eligible requests to Admin." : "Review applications, record decisions, disburse approved loans and inspect repayment history."}/>
    {mode === "staff" && <section className="mb-5 grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5"><p className="text-xs font-medium text-slate-400">Matching applications</p><p className="mt-3 text-2xl font-semibold text-slate-100">{result ? result.total.toLocaleString() : "—"}</p><p className="mt-1 text-[10px] text-slate-400">Count for the current filters.</p></article><article className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-5"><div className="flex items-center gap-2 text-blue-200"><ShieldCheck size={16}/><p className="text-xs font-semibold">Staff review only</p></div><p className="mt-2 text-[11px] leading-5 text-blue-100">You can add review notes and forward pending applications. Loan decisions and disbursement remain Admin actions.</p></article></section>}
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
      <LoanFilters status={status} onStatusChange={updateStatus} search={draftSearch} onSearch={setDraftSearch} onApplySearch={applySearch}/>
      {list.isLoading ? <div className="p-5"><LoanSkeleton/></div> : list.isError ? <div className="p-5"><LoanLoadError error={list.error} onRetry={() => void list.refetch()}/></div> : result?.loans.length ? <><LoanTable loans={result.loans} showCustomer onSelect={(id) => { setSelectedId(id); setHistoryPage(1); setActionError(""); setActionSuccess(""); }}/><Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage}/></> : <EmptyLoans/>}
    </section>
    {selectedId && <LoanDetailOverlay loan={selectedLoan} loading={detailQuery.isLoading} error={detailQuery.isError ? detailQuery.error : undefined} mode={mode} onClose={() => setSelectedId("")} onForward={mode === "staff" ? handleForward : undefined} onApprove={mode === "admin" ? handleApprove : undefined} onReject={mode === "admin" ? handleReject : undefined} onDisburse={mode === "admin" ? handleDisburse : undefined} isForwarding={forwardState.isLoading} isAdminActionLoading={isAdminActionLoading} actionError={actionError} actionSuccess={actionSuccess} repaymentHistory={adminHistory.data?.data} repaymentHistoryLoading={adminHistory.isLoading} repaymentHistoryError={adminHistory.isError ? adminHistory.error : undefined} onRetryRepaymentHistory={() => void adminHistory.refetch()} onHistoryPageChange={setHistoryPage}/>}
  </div>;
}

export function StaffLoansPage() { return <LoanQueuePage mode="staff"/>; }
export function AdminLoansPage() { return <LoanQueuePage mode="admin"/>; }
