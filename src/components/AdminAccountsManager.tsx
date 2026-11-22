"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Search, UserPlus, X } from "lucide-react";
import {
  useCreateAdminAccountMutation,
  useGetAccountHoldersQuery,
  useGetAdminAccountByIdQuery,
  useGetAdminAccountsQuery,
  useUpdateAdminAccountStatusMutation,
  type AccountStatus,
  type AccountType,
} from "@/store/bankAccountsApi";

const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Please try again.";
}

function balanceLabel(currency: string, balance: string) {
  return `${currency} ${balance}`;
}

export function AdminAccountsManager({ canManageStatus }: { canManageStatus: boolean }) {
  const [search, setSearch] = useState("");
  const [accountType, setAccountType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [holderSearch, setHolderSearch] = useState("");
  const [holderId, setHolderId] = useState("");
  const [newType, setNewType] = useState<AccountType>("SAVINGS");
  const [statusEditingId, setStatusEditingId] = useState("");
  const [nextStatus, setNextStatus] = useState<AccountStatus>("ACTIVE");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const listQuery = useGetAdminAccountsQuery({
    search: search.trim() || undefined,
    accountType: accountType ? accountType as AccountType : undefined,
    status: status ? status as AccountStatus : undefined,
    page,
    limit: 10,
  });
  const detailQuery = useGetAdminAccountByIdQuery(selectedId, { skip: !selectedId });
  const holdersQuery = useGetAccountHoldersQuery(
    { search: holderSearch.trim() || undefined },
    { skip: !createOpen },
  );
  const [createAccount, createState] = useCreateAdminAccountMutation();
  const [updateStatus, updateState] = useUpdateAdminAccountStatusMutation();
  const result = listQuery.data?.data;
  const detail = detailQuery.data?.data.account;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      await createAccount({ userId: holderId, accountType: newType }).unwrap();
      setSuccess("Bank account opened successfully. Its balance starts at BDT 0.00.");
      setCreateOpen(false);
      setHolderId("");
      setHolderSearch("");
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    }
  }

  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      await updateStatus({ id: statusEditingId, status: nextStatus }).unwrap();
      setSuccess("Account status updated.");
      setStatusEditingId("");
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-medium text-slate-400">Banking operations</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-100">Bank accounts</h1><p className="mt-1 text-sm text-slate-400">Review customer accounts and open new Savings or Current accounts.</p></div>
        <button type="button" onClick={() => { setError(""); setCreateOpen((open) => !open); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"><UserPlus size={16} /> Open account</button>
      </div>

      {(error || success) && <div role={error ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{error || success}</div>}

      {createOpen && <form onSubmit={submitCreate} className="mb-5 rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-slate-100">Open a customer account</h2><p className="mt-1 text-xs text-slate-400">Account number is generated securely; opening balance is fixed at BDT 0.00.</p></div><button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]" aria-label="Close form"><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="holder-search" className="mb-1.5 block text-xs font-semibold text-slate-400">Find active customer</label><input id="holder-search" className={inputClass} placeholder="Search name or email" value={holderSearch} onChange={(event) => setHolderSearch(event.target.value)} /></div><div><label htmlFor="holder-select" className="mb-1.5 block text-xs font-semibold text-slate-400">Account holder</label><select id="holder-select" className={inputClass} value={holderId} onChange={(event) => setHolderId(event.target.value)} required><option value="">Select customer</option>{holdersQuery.data?.data.users.map((holder) => <option key={holder.id} value={holder.id}>{holder.name} · {holder.email}</option>)}</select>{holdersQuery.isLoading && <p className="mt-1 text-[11px] text-slate-400">Loading customers…</p>}{holdersQuery.isError && <p role="alert" className="mt-1 text-[11px] text-rose-200">Could not load customers.</p>}</div><div><label htmlFor="account-type" className="mb-1.5 block text-xs font-semibold text-slate-400">Account type</label><select id="account-type" className={inputClass} value={newType} onChange={(event) => setNewType(event.target.value as AccountType)}><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select></div></div><div className="mt-5 flex justify-end"><button type="submit" disabled={!holderId || createState.isLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{createState.isLoading ? "Opening…" : "Open account"}</button></div></form>}

      {selectedId && <section className="mb-5 rounded-2xl border border-white/[0.08] bg-[#10182b] p-5 shadow-sm" aria-label="Account details"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200">Account details</p><h2 className="mt-1 font-mono text-lg font-semibold text-slate-100">{detailQuery.isLoading ? "Loading account…" : detail?.accountNumber ?? "Account unavailable"}</h2></div><button type="button" onClick={() => setSelectedId("")} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]" aria-label="Close details"><X size={18} /></button></div>{detailQuery.isError ? <p role="alert" className="mt-3 text-sm text-rose-200">{errorMessage(detailQuery.error)}</p> : detail && <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-slate-400">Account holder</p><p className="mt-1 font-medium text-slate-200">{detail.accountHolder?.name ?? "Unavailable"}</p><p className="mt-0.5 text-xs text-slate-400">{detail.accountHolder?.email}</p></div><div><p className="text-xs text-slate-400">Account type</p><p className="mt-1 font-medium text-slate-200">{detail.accountType}</p></div><div><p className="text-xs text-slate-400">Balance</p><p className="mt-1 font-semibold text-slate-100">{balanceLabel(detail.currency, detail.balance)}</p></div><div><p className="text-xs text-slate-400">Status · opened</p><p className="mt-1 font-medium text-slate-200">{detail.status}</p><p className="mt-0.5 text-xs text-slate-400">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(detail.createdAt))}</p></div></div>}</section>}

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:p-5"><label className="relative min-w-0 flex-1"><span className="sr-only">Search accounts and account holders</span><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-10`} placeholder="Account number, customer name or email" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }}/></label><select aria-label="Filter account type" className={`${inputClass} sm:w-40`} value={accountType} onChange={(event) => { setPage(1); setAccountType(event.target.value); }}><option value="">All account types</option><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select><select aria-label="Filter account status" className={`${inputClass} sm:w-40`} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="FROZEN">Frozen</option><option value="CLOSED">Closed</option></select></div>
        {listQuery.isLoading ? <div role="status" className="p-12 text-center text-sm text-slate-400">Loading accounts…</div> : listQuery.isError ? <div role="alert" className="p-12 text-center"><p className="text-sm text-rose-200">Could not load accounts.</p><button type="button" onClick={() => void listQuery.refetch()} className="mt-2 text-sm font-semibold text-emerald-200">Try again</button></div> : result?.accounts.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3.5 font-semibold">Account</th><th className="px-4 py-3.5 font-semibold">Customer</th><th className="px-4 py-3.5 font-semibold">Type</th><th className="px-4 py-3.5 font-semibold">Balance</th><th className="px-4 py-3.5 font-semibold">Status</th><th className="px-5 py-3.5 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{result.accounts.map((account) => <tr key={account.id} className="hover:bg-white/[0.035]"><td className="px-5 py-4"><button type="button" onClick={() => setSelectedId(account.id)} className="font-mono text-sm font-semibold text-slate-100 hover:text-emerald-200">{account.accountNumber}</button></td><td className="px-4 py-4"><span className="block text-sm font-medium text-slate-200">{account.accountHolder?.name ?? "Unavailable"}</span><span className="mt-1 block text-xs text-slate-400">{account.accountHolder?.email}</span></td><td className="px-4 py-4 text-xs font-medium text-slate-400">{account.accountType}</td><td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-slate-100">{balanceLabel(account.currency, account.balance)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${account.status === "ACTIVE" ? "bg-emerald-400/10 text-emerald-200" : account.status === "CLOSED" ? "bg-white/[0.07] text-slate-400" : account.status === "FROZEN" ? "bg-blue-400/10 text-blue-200" : "bg-amber-400/10 text-amber-200"}`}>{account.status}</span></td><td className="px-5 py-4 text-right">{canManageStatus && <button type="button" onClick={() => { setStatusEditingId(account.id); setNextStatus(account.status); setError(""); }} className="text-xs font-semibold text-slate-100 hover:text-emerald-200">Change status</button>}</td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4"><p className="text-xs text-slate-400">{result.total} accounts · Page {result.page} of {Math.max(1, result.totalPages)}</p><div className="flex gap-2"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronLeft size={16}/></button><button type="button" aria-label="Next page" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 disabled:opacity-40"><ChevronRight size={16}/></button></div></div></> : <div className="p-12 text-center"><CreditCard size={20} className="mx-auto text-slate-400"/><p className="mt-3 text-sm font-semibold text-slate-400">No accounts found</p><p className="mt-1 text-xs text-slate-400">Open an account or adjust your search.</p></div>}
      </section>

      {statusEditingId && canManageStatus && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"><form onSubmit={submitStatus} className="w-full max-w-md rounded-2xl bg-[#10182b] p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="font-semibold text-slate-100">Change account status</h2><p className="mt-1 text-xs text-slate-400">Closed accounts cannot be reopened.</p></div><button type="button" onClick={() => setStatusEditingId("")} aria-label="Close status editor" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]"><X size={17}/></button></div><label htmlFor="next-account-status" className="mb-1.5 mt-5 block text-xs font-semibold text-slate-400">New status</label><select id="next-account-status" className={inputClass} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as AccountStatus)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="FROZEN">Frozen</option><option value="CLOSED">Closed</option></select>{error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setStatusEditingId("")} className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-slate-400">Cancel</button><button type="submit" disabled={updateState.isLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{updateState.isLoading ? "Saving…" : "Save status"}</button></div></form></div>}
    </div>
  );
}
