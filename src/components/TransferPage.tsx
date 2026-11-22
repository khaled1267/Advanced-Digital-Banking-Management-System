"use client";

import { useRef, useState } from "react";
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, FileText, ShieldCheck, Wallet } from "lucide-react";
import { parseBdtPaisa } from "@/lib/bdt-money";
import { useGetMyAccountsQuery } from "@/store/bankAccountsApi";
import {
  useCreateTransferMutation,
  useGetMyTransfersQuery,
  type CreateTransferRequest,
  type TransferRecord,
} from "@/store/transfersApi";
import { apiMessage, formatDate, inputClass } from "@/components/DepositPages";

function TransferHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useGetMyTransfersQuery({ page, limit: 8 });
  const result = data?.data;

  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
    <div className="border-b border-white/[0.06] p-5"><h2 className="text-sm font-semibold text-slate-100">Transfer history</h2><p className="mt-1 text-xs text-slate-400">Completed transfers sent and received by your accounts.</p></div>
    {isLoading ? <div role="status" className="p-10 text-center text-sm text-slate-400">Loading transfers…</div> : isError ? <div className="p-10 text-center"><p role="alert" className="text-sm text-rose-200">{apiMessage(error, "Could not load transfers.")}</p><button type="button" onClick={() => void refetch()} className="mt-2 text-xs font-semibold text-emerald-200">Try again</button></div> : result?.transfers.length ? <>
      <div className="overflow-x-auto"><table className="w-full min-w-[690px] text-left"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Reference</th><th className="px-4 py-3 font-semibold">Direction</th><th className="px-4 py-3 font-semibold">From / To</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Date</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{result.transfers.map((transfer) => <TransferRow key={transfer.id} transfer={transfer}/>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4"><p className="text-xs text-slate-400">{result.total} transfers · Page {result.page} of {Math.max(result.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs disabled:opacity-40">Next</button></div></div>
    </> : <div className="p-10 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-slate-400"><FileText size={18}/></span><p className="mt-3 text-sm font-semibold text-slate-400">No transfers yet</p><p className="mt-1 text-xs text-slate-400">Transfers to or from your accounts will appear here.</p></div>}
  </section>;
}

function TransferRow({ transfer }: { transfer: TransferRecord }) {
  const sent = transfer.direction === "SENT";
  return <tr className="hover:bg-white/[0.035]"><td className="px-5 py-4 font-mono text-xs font-semibold text-slate-100">{transfer.transactionId}</td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${sent ? "bg-amber-400/10 text-amber-200" : "bg-emerald-400/10 text-emerald-200"}`}>{sent ? <ArrowUpRight size={12}/> : <ArrowDownLeft size={12}/ >}{transfer.direction}</span></td><td className="px-4 py-4 font-mono text-[11px] text-slate-400">{transfer.fromAccount?.maskedAccountNumber ?? "Unavailable"} <span className="px-1 text-slate-400">→</span> {transfer.toAccount?.maskedAccountNumber ?? "Unavailable"}</td><td className="px-4 py-4 whitespace-nowrap text-xs font-semibold text-slate-100">BDT {transfer.amount}</td><td className="px-4 py-4 whitespace-nowrap text-[11px] text-slate-400">{formatDate(transfer.createdAt)}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${transfer.status === "COMPLETED" ? "bg-emerald-400/10 text-emerald-200" : "bg-white/[0.07] text-slate-400"}`}>{transfer.status === "COMPLETED" ? <CheckCircle2 size={12}/> : <Clock3 size={12}/ >}{transfer.status}</span></td></tr>;
}

export function CustomerTransferPage() {
  const { data: accountData, isLoading: accountsLoading, isError: accountsError } = useGetMyAccountsQuery();
  const accounts = accountData?.data.accounts.filter((account) => account.status === "ACTIVE") ?? [];
  const [fromAccountId, setFromAccountId] = useState("");
  const [recipientAccountNumber, setRecipientAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const retryKey = useRef("");
  const [createTransfer, createState] = useCreateTransferMutation();
  const selectedAccount = accounts.find((account) => account.id === fromAccountId);
  const amountPaisa = parseBdtPaisa(amount.trim());
  const amountValid = amountPaisa !== null && amountPaisa > BigInt("0");
  const availablePaisa = selectedAccount ? parseBdtPaisa(selectedAccount.balance) : null;
  const exceedsBalance = amountValid && availablePaisa !== null && amountPaisa > availablePaisa;
  const normalizedRecipient = recipientAccountNumber.trim().toUpperCase();
  const recipientValid = /^NB[A-F\d]{16}$/.test(normalizedRecipient);

  function editField(update: () => void) {
    update();
    retryKey.current = "";
    setConfirming(false);
    setFeedback("");
  }

  async function submitTransfer() {
    if (!selectedAccount || !amountValid || !recipientValid || exceedsBalance) return;
    setFeedback("");
    if (!retryKey.current) retryKey.current = crypto.randomUUID();
    const request: CreateTransferRequest = {
      fromAccountId,
      recipientAccountNumber: normalizedRecipient,
      amount: amount.trim(),
      description: description.trim() || undefined,
      idempotencyKey: retryKey.current,
    };
    try {
      const result = await createTransfer(request).unwrap();
      setFeedback(`Transfer ${result.data.transfer.transactionId} completed successfully.`);
      setFeedbackError(false);
      setFromAccountId("");
      setRecipientAccountNumber("");
      setAmount("");
      setDescription("");
      setConfirming(false);
      retryKey.current = "";
    } catch (error: unknown) {
      setFeedback(apiMessage(error, "Could not complete the transfer. You can retry safely."));
      setFeedbackError(true);
    }
  }

  return <div className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="text-xs font-medium text-slate-400">Personal banking</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-100">Transfer money</h1><p className="mt-1 text-sm text-slate-400">Send BDT securely to an active Northstar Bank customer account.</p></div>
    <div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10 text-slate-100"><ArrowLeftRight size={19}/></span><div><h2 className="text-sm font-semibold text-slate-100">New bank transfer</h2><p className="mt-1 text-xs text-slate-400">The transfer completes immediately after confirmation.</p></div></div>
        <div className="mt-5 space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">From account</span><select className={inputClass} value={fromAccountId} onChange={(event) => editField(() => setFromAccountId(event.target.value))} disabled={accountsLoading || accountsError || accounts.length === 0}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.accountType} · {account.accountNumber}</option>)}</select>{accountsLoading && <span className="mt-1 block text-[10px] text-slate-400">Loading your accounts…</span>}{accountsError && <span role="alert" className="mt-1 block text-[10px] text-rose-200">Could not load your accounts.</span>}{!accountsLoading && !accountsError && accounts.length === 0 && <span className="mt-1 block text-[10px] text-amber-200">You need an active account to send a transfer.</span>}</label>
          {selectedAccount && <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10182b] text-slate-100"><Wallet size={16}/></span><div><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Available balance</p><p className="mt-0.5 text-sm font-semibold text-slate-100">BDT {selectedAccount.balance}</p></div></div>}
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Recipient account number</span><input className={inputClass} autoComplete="off" placeholder="NB followed by 16 characters" value={recipientAccountNumber} onChange={(event) => editField(() => setRecipientAccountNumber(event.target.value))}/>{recipientAccountNumber.length > 0 && !recipientValid && <span className="mt-1 block text-[10px] text-rose-200">Enter a valid Northstar account number.</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Amount (BDT)</span><input className={inputClass} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => editField(() => setAmount(event.target.value))}/><span className="mt-1 block text-[10px] text-slate-400">Enter a positive amount with up to two poisha decimal places.</span>{amount.length > 0 && !amountValid && <span className="mt-1 block text-[10px] text-rose-200">Enter a valid positive amount.</span>}{exceedsBalance && <span role="status" className="mt-1 block text-[10px] text-rose-200">This is above the currently available balance.</span>}</label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">Description <span className="font-normal text-slate-400">(optional)</span></span><textarea className={inputClass + " min-h-20 resize-y"} maxLength={120} placeholder="What is this transfer for?" value={description} onChange={(event) => editField(() => setDescription(event.target.value))}/><span className="mt-1 block text-right text-[10px] text-slate-400">{description.length}/120</span></label>
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3.5"><div className="flex items-start gap-2.5"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-200"/><p className="text-xs leading-5 text-blue-100">The server checks both accounts and the latest balance. Repeating the same confirmed request is protected from duplicate transfers.</p></div></div>
          {feedback && <p role={feedbackError ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-xs ${feedbackError ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>{feedback}</p>}
          {confirming ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><p className="text-xs font-semibold text-slate-100">Review your transfer</p><p className="mt-2 text-xs text-slate-400">BDT {amount} from account ending {selectedAccount?.accountNumber.slice(-4)} to {normalizedRecipient}</p>{description.trim() && <p className="mt-1 text-xs text-slate-400">Note: {description.trim()}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void submitTransfer()} disabled={createState.isLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{createState.isLoading ? "Sending…" : "Confirm transfer"}</button><button type="button" onClick={() => setConfirming(false)} disabled={createState.isLoading} className="rounded-xl border border-white/[0.08] bg-[#10182b] px-4 py-2.5 text-xs font-semibold text-slate-400">Edit</button></div></div> : <button type="button" disabled={!selectedAccount || !amountValid || !recipientValid || exceedsBalance} onClick={() => { setFeedback(""); setConfirming(true); }} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">Review transfer</button>}
        </div>
      </section>
      <TransferHistory/>
    </div>
  </div>;
}
