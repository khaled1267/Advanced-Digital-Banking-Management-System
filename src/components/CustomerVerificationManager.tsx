"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Clock3, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useDecideCustomerVerificationMutation, useGetCustomerVerificationDetailsQuery, useGetCustomersForVerificationQuery, type CustomerVerificationRecord, type VerificationStatus } from "@/store/customerVerificationApi";

const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error && typeof error.data === "object" && error.data !== null && "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "The verification update could not be completed. Please try again.";
}

function dateLabel(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const style = status === "VERIFIED" ? "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200" : status === "REJECTED" ? "border-rose-300/15 bg-rose-300/[0.07] text-rose-200" : "border-amber-300/15 bg-amber-300/[0.07] text-amber-200";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{status}</span>;
}

function CustomerRow({ customer, onSelect, selected }: { customer: CustomerVerificationRecord; onSelect: () => void; selected: boolean }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`grid w-full gap-3 border-b border-white/[0.06] px-4 py-4 text-left transition last:border-0 hover:bg-white/[0.035] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5 ${selected ? "bg-blue-400/[0.06]" : ""}`}>
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] text-blue-200">
        {customer.profileImageUrl ? <span role="img" aria-label={`Profile picture of ${customer.name}`} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${customer.profileImageUrl}")` }}/> : <UserRound size={17}/>}
      </span>
      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-100">{customer.name}</span><span className="mt-1 block truncate text-xs text-slate-400">{customer.email}</span></span>
    </span>
    <span className="sm:justify-self-start"><StatusBadge status={customer.verificationStatus}/></span>
    <span className="text-[10px] text-slate-500 sm:text-right">Joined {dateLabel(customer.createdAt)}</span>
  </button>;
}

export function CustomerVerificationManager() {
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [decide, decisionState] = useDecideCustomerVerificationMutation();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const listQuery = useGetCustomersForVerificationQuery({ search: searchTerm || undefined, verificationStatus, page, limit: 10 });
  const detailQuery = useGetCustomerVerificationDetailsQuery(selectedId, { skip: !selectedId });
  const data = listQuery.data?.data;
  const customer = detailQuery.data?.data.customer;

  async function submitDecision(verificationStatus: "VERIFIED" | "REJECTED") {
    if (!customer) return;
    const note = rejectionNote.trim();
    if (verificationStatus === "REJECTED" && note.length < 5) {
      setError("Enter a rejection reason of at least 5 characters.");
      return;
    }
    const confirmation = verificationStatus === "VERIFIED"
      ? `Verify ${customer.name}'s customer information? This decision cannot be changed.`
      : `Reject ${customer.name}'s verification? This decision cannot be changed.`;
    if (!window.confirm(confirmation)) return;

    setError("");
    setFeedback("");
    try {
      await decide({ id: customer.id, decision: verificationStatus === "VERIFIED" ? { verificationStatus } : { verificationStatus, verificationNote: note } }).unwrap();
      setFeedback(`${customer.name} was marked ${verificationStatus.toLowerCase()}.`);
      setRejectionNote("");
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    }
  }

  return <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-6"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">Customer operations</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Customer verification</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">Review the customer details stored in Northstar. No identity documents or additional personal information are collected here.</p></div>

    {(feedback || error) && <div role={error ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-300/15 bg-rose-300/[0.05] text-rose-200" : "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200"}`}>{error || feedback}</div>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(350px,0.85fr)]">
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm" aria-label="Customer verification list">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:p-5">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search customers by name or email</span><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"/><input className={`${inputClass} pl-10`} placeholder="Search name or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/></label>
          <select aria-label="Filter by verification status" className={`${inputClass} sm:w-44`} value={verificationStatus} onChange={(event) => { setVerificationStatus(event.target.value as VerificationStatus | ""); setPage(1); }}><option value="">All verification statuses</option><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option></select>
        </div>
        {listQuery.isLoading ? <div role="status" className="p-12 text-center text-sm text-slate-400">Loading customers…</div>
          : listQuery.isError ? <div className="p-10 text-center" role="alert"><p className="text-sm text-rose-200">Customer verification list could not be loaded.</p><button type="button" onClick={() => void listQuery.refetch()} className="mt-2 text-xs font-semibold text-blue-200">Try again</button></div>
            : data?.customers.length ? <>
              <div>{data.customers.map((item) => <CustomerRow key={item.id} customer={item} selected={selectedId === item.id} onSelect={() => { setSelectedId(item.id); setRejectionNote(""); setError(""); }}/>)}</div>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5 sm:px-5"><p className="text-xs text-slate-500">{data.total} customers · Page {data.page} of {Math.max(1, data.totalPages)}</p><div className="flex gap-2"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronLeft size={16}/></button><button type="button" aria-label="Next page" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronRight size={16}/></button></div></div>
            </> : <div className="p-12 text-center"><p className="text-sm font-semibold text-slate-300">No customers found</p><p className="mt-1 text-xs text-slate-500">Try another search or verification filter.</p></div>}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-sm sm:p-6" aria-label="Selected customer details">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Verification review</p><h2 className="mt-1 text-lg font-semibold text-slate-100">{customer?.name ?? "Customer details"}</h2></div>{selectedId && <button type="button" onClick={() => setSelectedId("")} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06]" aria-label="Close customer details"><X size={17}/></button>}</div>
        {!selectedId ? <div className="mt-6 rounded-xl border border-dashed border-white/[0.1] p-6 text-center"><ShieldCheck size={22} className="mx-auto text-slate-500"/><p className="mt-3 text-sm font-medium text-slate-300">Select a customer to review</p><p className="mt-1 text-xs leading-5 text-slate-500">Review only the name, email, account status, and registration details available in this application.</p></div>
          : detailQuery.isLoading ? <p role="status" className="mt-6 text-sm text-slate-400">Loading customer details…</p>
            : detailQuery.isError || !customer ? <div role="alert" className="mt-6"><p className="text-sm text-rose-200">Could not load customer details.</p><button type="button" onClick={() => void detailQuery.refetch()} className="mt-2 text-xs font-semibold text-blue-200">Try again</button></div>
              : <>
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-400/10 text-blue-200">{customer.profileImageUrl ? <span role="img" aria-label={`Profile picture of ${customer.name}`} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${customer.profileImageUrl}")` }}/> : <UserRound size={18}/>}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-100">{customer.name}</span><span className="mt-1 block truncate text-xs text-slate-400">{customer.email}</span></span></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Account access</dt><dd className="mt-1 font-semibold text-slate-200">{customer.status}</dd></div><div className="rounded-xl border border-white/[0.06] p-3"><dt className="text-slate-500">Customer since</dt><dd className="mt-1 font-semibold text-slate-200">{dateLabel(customer.createdAt)}</dd></div></dl>
                <div className="mt-4 rounded-xl border border-white/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-200">Verification status</h3><StatusBadge status={customer.verificationStatus}/></div>
                  {customer.verifiedAt && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14}/>Reviewed {dateLabel(customer.verifiedAt)}{customer.verifiedBy ? ` by ${customer.verifiedBy.name} (${customer.verifiedBy.role})` : ""}</p>}
                  {customer.verificationNote && <p className="mt-3 rounded-lg bg-rose-300/[0.05] p-3 text-xs leading-5 text-rose-100"><span className="font-semibold">Rejection reason: </span>{customer.verificationNote}</p>}
                </div>
                {customer.verificationStatus === "PENDING" ? <div className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-slate-400" htmlFor="verification-rejection-note">Rejection reason <span className="text-slate-500">(required when rejecting)</span><textarea id="verification-rejection-note" className={`${inputClass} mt-2 min-h-24 resize-y`} value={rejectionNote} maxLength={500} onChange={(event) => setRejectionNote(event.target.value)} placeholder="Explain what information needs attention."/></label>
                  <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={decisionState.isLoading || rejectionNote.trim().length < 5} onClick={() => void submitDecision("REJECTED")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-300/15 px-3.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-300/[0.06] disabled:cursor-not-allowed disabled:opacity-40"><X size={14}/>Reject</button><button type="button" disabled={decisionState.isLoading} onClick={() => void submitDecision("VERIFIED")} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50"><Check size={14}/><BadgeCheck size={14}/>{decisionState.isLoading ? "Saving…" : "Mark verified"}</button></div>
                </div> : <p className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.025] p-3 text-xs leading-5 text-slate-400"><BadgeCheck size={15} className="shrink-0"/>A verification decision has been recorded and cannot be changed.</p>}
              </>}
      </section>
    </div>
  </div>;
}
