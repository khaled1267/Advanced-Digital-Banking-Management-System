"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Download, FileText, RefreshCw, Search, Wallet } from "lucide-react";
import { accountStatementSelectionKey, calculateStatementPageTotals, createStatementDownloadUrl } from "@/lib/account-statement-client";
import type { DashboardRole } from "@/components/DashboardShell";
import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";
import {
  useGetAccountStatementQuery,
  useLazyGetAccountStatementQuery,
  type AccountStatementTransaction,
} from "@/store/accountStatementsApi";
import {
  useGetAdminAccountsQuery,
  useGetMyAccountsQuery,
  type BankAccount,
} from "@/store/bankAccountsApi";

const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15";
const STATEMENT_PAGE_SIZE = 25;
const AGGREGATE_PAGE_SIZE = 100;

type DateRange = { startDate: string; endDate: string };
type TotalsState = {
  key: string;
  status: "loading" | "success" | "error";
  debitPaisa: bigint;
  creditPaisa: bigint;
  error?: unknown;
};

function errorStatus(error: unknown) {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  return fallback;
}

function moneyLabel(value: string) {
  const paisa = parseBdtPaisa(value);
  if (paisa === null) return "—";
  const [whole, fraction] = formatBdtPaisa(paisa).split(".");
  return `BDT ${BigInt(whole).toLocaleString("en-US")}.${fraction}`;
}

function paisaLabel(value: bigint) {
  return moneyLabel(formatBdtPaisa(value));
}

function formatTransactionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayAccount(account: BankAccount) {
  const holder = account.accountHolder?.name ? ` · ${account.accountHolder.name}` : "";
  return `${account.accountNumber} · ${account.accountType}${holder}`;
}

function StatementMetric({
  label,
  value,
  detail,
  icon: Icon,
  loading = false,
  tone = "navy",
}: {
  label: string;
  value?: string;
  detail: string;
  icon: typeof Wallet;
  loading?: boolean;
  tone?: "navy" | "green" | "amber" | "blue";
}) {
  const tones = {
    navy: "bg-blue-400/10 text-slate-100",
    green: "bg-emerald-400/10 text-emerald-200",
    amber: "bg-amber-400/10 text-amber-200",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          {loading ? <div className="mt-3 h-6 w-32 animate-pulse rounded-md bg-white/[0.07]" aria-label={`Loading ${label.toLowerCase()}`} /> : <p className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-100">{value ?? "—"}</p>}
          <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={17} /></span>
      </div>
    </section>
  );
}

function StatementSkeleton() {
  return (
    <div role="status" aria-label="Loading statement" className="space-y-3 p-5">
      <span className="sr-only">Loading statement transactions…</span>
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-4 gap-4"><div className="h-4 animate-pulse rounded bg-white/[0.07]"/><div className="h-4 animate-pulse rounded bg-white/[0.07]"/><div className="h-4 animate-pulse rounded bg-white/[0.07]"/><div className="h-4 animate-pulse rounded bg-white/[0.07]"/></div>)}
    </div>
  );
}

function TransactionTable({ transactions }: { transactions: AccountStatementTransaction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] text-left">
        <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-5 py-3.5 font-semibold">Date</th>
            <th className="px-4 py-3.5 font-semibold">Transaction ID</th>
            <th className="px-4 py-3.5 font-semibold">Type</th>
            <th className="px-4 py-3.5 font-semibold">Description</th>
            <th className="px-4 py-3.5 text-right font-semibold">Debit</th>
            <th className="px-4 py-3.5 text-right font-semibold">Credit</th>
            <th className="px-5 py-3.5 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-white/[0.035]">
              <td className="whitespace-nowrap px-5 py-4 text-[11px] text-slate-400">{formatTransactionDate(transaction.createdAt)}</td>
              <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-semibold text-slate-100">{transaction.transactionId}</td>
              <td className="px-4 py-4 text-xs font-medium text-slate-400">{transaction.transactionType.replaceAll("_", " ")}</td>
              <td className="max-w-[240px] px-4 py-4 text-xs text-slate-400"><span className="block truncate" title={transaction.description || "No description"}>{transaction.description || "—"}</span></td>
              <td className="whitespace-nowrap px-4 py-4 text-right text-xs font-medium text-slate-400">{transaction.debit === "0.00" ? "—" : moneyLabel(transaction.debit)}</td>
              <td className="whitespace-nowrap px-4 py-4 text-right text-xs font-medium text-emerald-200">{transaction.credit === "0.00" ? "—" : moneyLabel(transaction.credit)}</td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-semibold text-slate-100">{moneyLabel(transaction.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountStatementPage({ role }: { role: DashboardRole }) {
  const [accountSearch, setAccountSearch] = useState("");
  const [adminAccountPage, setAdminAccountPage] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [draftDates, setDraftDates] = useState<DateRange>({ startDate: "", endDate: "" });
  const [appliedDates, setAppliedDates] = useState<DateRange>({ startDate: "", endDate: "" });
  const [dateError, setDateError] = useState("");
  const [page, setPage] = useState(1);
  const [totals, setTotals] = useState<TotalsState>({ key: "", status: "success", debitPaisa: BigInt("0"), creditPaisa: BigInt("0") });
  const [totalsAttempt, setTotalsAttempt] = useState(0);
  const [downloading, setDownloading] = useState<"pdf" | "csv" | "">("");
  const [downloadError, setDownloadError] = useState("");

  const customerAccountsQuery = useGetMyAccountsQuery(undefined, { skip: role !== "customer" });
  const adminAccountsQuery = useGetAdminAccountsQuery({
    search: accountSearch.trim() || undefined,
    page: adminAccountPage,
    limit: 100,
  }, { skip: role === "customer" });
  const customerAccounts = customerAccountsQuery.data?.data.accounts ?? [];
  const adminAccounts = adminAccountsQuery.data?.data.accounts ?? [];
  const accountOptions = role === "customer" ? customerAccounts : adminAccounts;
  const accountsLoading = role === "customer" ? customerAccountsQuery.isLoading : adminAccountsQuery.isLoading;
  const accountsError = role === "customer" ? customerAccountsQuery.error : adminAccountsQuery.error;
  const retryAccounts = role === "customer" ? customerAccountsQuery.refetch : adminAccountsQuery.refetch;
  const adminAccountTotalPages = Math.max(1, adminAccountsQuery.data?.data.totalPages ?? 1);

  const selectedAccountId = selectedAccount?.id;
  const currentKey = useMemo(
    () => accountStatementSelectionKey(selectedAccountId ?? "", appliedDates.startDate, appliedDates.endDate),
    [selectedAccountId, appliedDates.startDate, appliedDates.endDate],
  );
  const statementArgs = useMemo(() => ({
    accountId: selectedAccountId ?? "",
    startDate: appliedDates.startDate || undefined,
    endDate: appliedDates.endDate || undefined,
    page,
    limit: STATEMENT_PAGE_SIZE,
  }), [selectedAccountId, appliedDates.startDate, appliedDates.endDate, page]);
  const statementQuery = useGetAccountStatementQuery(statementArgs, { skip: !selectedAccount });
  const [loadStatementPage] = useLazyGetAccountStatementQuery();

  useEffect(() => {
    let cancelled = false;
    const accountId = selectedAccount?.id;
    if (!accountId) return () => { cancelled = true; };

    const key = currentKey;
    async function loadAllPageTotals() {
      try {
        const queryBase = {
          accountId: accountId!,
          startDate: appliedDates.startDate || undefined,
          endDate: appliedDates.endDate || undefined,
          limit: AGGREGATE_PAGE_SIZE,
        };
        const firstPage = await loadStatementPage({ ...queryBase, page: 1 }).unwrap();
        const sum = calculateStatementPageTotals(firstPage.data.transactions);
        for (let currentPage = 2; currentPage <= firstPage.data.totalPages; currentPage += 1) {
          const nextPage = await loadStatementPage({ ...queryBase, page: currentPage }).unwrap();
          const pageTotals = calculateStatementPageTotals(nextPage.data.transactions);
          sum.debitPaisa += pageTotals.debitPaisa;
          sum.creditPaisa += pageTotals.creditPaisa;
        }
        if (!cancelled) setTotals({ key, status: "success", ...sum });
      } catch (error: unknown) {
        if (!cancelled) setTotals({ key, status: "error", debitPaisa: BigInt("0"), creditPaisa: BigInt("0"), error });
      }
    }
    void loadAllPageTotals();
    return () => { cancelled = true; };
  }, [selectedAccount?.id, appliedDates.startDate, appliedDates.endDate, currentKey, loadStatementPage, totalsAttempt]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftDates.startDate && draftDates.endDate && draftDates.startDate > draftDates.endDate) {
      setDateError("End date must be on or after the start date.");
      return;
    }
    setDateError("");
    setAppliedDates(draftDates);
    setPage(1);
  }

  function selectAccount(accountId: string) {
    const account = accountOptions.find((option) => option.id === accountId) ?? null;
    setSelectedAccount(account);
    setPage(1);
    setDownloadError("");
  }

  function retryTotals() {
    if (currentKey) setTotals({ key: currentKey, status: "loading", debitPaisa: BigInt("0"), creditPaisa: BigInt("0") });
    setTotalsAttempt((attempt) => attempt + 1);
  }

  async function downloadStatement(format: "pdf" | "csv") {
    if (!selectedAccount) return;
    setDownloading(format);
    setDownloadError("");
    try {
      const response = await fetch(
        createStatementDownloadUrl(selectedAccount.id, format, appliedDates.startDate, appliedDates.endDate),
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Your session is not authorized. Please sign in again or contact your administrator.");
        }
        throw new Error(errorMessage(await response.json().catch(() => null), `Could not download the ${format.toUpperCase()} statement.`));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/i.exec(disposition)?.[1]
        ?? `account-statement.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error: unknown) {
      setDownloadError(error instanceof Error ? error.message : `Could not download the ${format.toUpperCase()} statement.`);
    } finally {
      setDownloading("");
    }
  }

  const data = statementQuery.currentData?.data;
  const totalsAreCurrent = totals.key === currentKey;
  const totalsLoading = Boolean(selectedAccount) && (!totalsAreCurrent || totals.status === "loading");
  const totalsError = totalsAreCurrent && totals.status === "error" ? totals.error : null;
  const statementUnauthorized = errorStatus(statementQuery.error) === 401 || errorStatus(statementQuery.error) === 403;
  const accountsUnauthorized = errorStatus(accountsError) === 401 || errorStatus(accountsError) === 403;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">{role === "customer" ? "Personal banking" : "Banking operations"}</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-100">Account statements</h1>
          <p className="mt-1 text-sm text-slate-400">Review completed account activity and download an official statement.</p>
        </div>
        {selectedAccount && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-medium text-emerald-200">{selectedAccount.accountType} · {selectedAccount.currency}</span>}
      </div>

      <section className="mb-5 rounded-2xl border border-white/[0.08] bg-[#10182b] p-4 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,1.3fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto] lg:items-end">
          <div>
            <label htmlFor="statement-account" className="mb-1.5 block text-xs font-semibold text-slate-400">Account</label>
            {role !== "customer" && <label className="relative mb-2 block"><span className="sr-only">Search accounts or customers</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-9`} value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setAdminAccountPage(1); }} placeholder="Search account or customer"/></label>}
            <select id="statement-account" className={inputClass} value={selectedAccount?.id ?? ""} onChange={(event) => selectAccount(event.target.value)} disabled={accountsLoading || Boolean(accountsError)}>
              <option value="">{accountsLoading ? "Loading accounts…" : "Choose an account"}</option>
              {accountOptions.map((account) => <option key={account.id} value={account.id}>{displayAccount(account)}</option>)}
              {selectedAccount && !accountOptions.some((account) => account.id === selectedAccount.id) && <option value={selectedAccount.id}>{displayAccount(selectedAccount)}</option>}
            </select>
            {role !== "customer" && adminAccountsQuery.data?.data.totalPages && adminAccountsQuery.data.data.totalPages > 1 && <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400"><span>{adminAccountsQuery.data.data.total.toLocaleString()} accounts · page {adminAccountPage} of {adminAccountTotalPages}</span><span className="flex gap-1"><button type="button" aria-label="Previous account results" disabled={adminAccountPage <= 1} onClick={() => setAdminAccountPage((value) => value - 1)} className="rounded border border-white/[0.08] px-2 py-1 disabled:opacity-40">‹</button><button type="button" aria-label="Next account results" disabled={adminAccountPage >= adminAccountTotalPages} onClick={() => setAdminAccountPage((value) => value + 1)} className="rounded border border-white/[0.08] px-2 py-1 disabled:opacity-40">›</button></span></div>}
          </div>
          <div>
            <label htmlFor="statement-start-date" className="mb-1.5 block text-xs font-semibold text-slate-400">Start date</label>
            <input id="statement-start-date" type="date" className={inputClass} value={draftDates.startDate} onChange={(event) => setDraftDates((dates) => ({ ...dates, startDate: event.target.value }))}/>
          </div>
          <div>
            <label htmlFor="statement-end-date" className="mb-1.5 block text-xs font-semibold text-slate-400">End date</label>
            <input id="statement-end-date" type="date" className={inputClass} value={draftDates.endDate} onChange={(event) => setDraftDates((dates) => ({ ...dates, endDate: event.target.value }))}/>
          </div>
          <form onSubmit={applyFilters} className="lg:pb-0">
            <button type="submit" className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 lg:w-auto">Apply filters</button>
          </form>
        </div>
        {dateError && <p role="alert" className="mt-3 text-xs text-rose-200">{dateError}</p>}
        {accountsUnauthorized && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-xs text-rose-200"><AlertCircle size={14}/><span>Your account list is not authorized.</span><Link href="/login" className="font-semibold underline">Sign in again</Link></div>}
        {accountsError && !accountsUnauthorized && <div role="alert" className="mt-3 flex items-center gap-2 text-xs text-rose-200"><span>{errorMessage(accountsError, "Could not load accounts.")}</span><button type="button" onClick={() => void retryAccounts()} className="font-semibold underline">Try again</button></div>}
        {!accountsLoading && !accountsError && accountOptions.length === 0 && <p className="mt-3 text-xs text-slate-400">{role === "customer" ? "No accounts are available for your profile." : "No accounts match this search."}</p>}
      </section>

      {downloadError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"><AlertCircle size={16} className="mt-0.5 shrink-0"/><div className="flex-1">{downloadError}{downloadError.toLowerCase().includes("sign in") && <Link href="/login" className="ml-2 font-semibold underline">Sign in</Link>}</div><button type="button" onClick={() => setDownloadError("")} aria-label="Dismiss download error" className="font-semibold">×</button></div>}

      {!selectedAccount ? (
        <section className="rounded-2xl border border-dashed border-white/[0.12] bg-[#10182b] px-5 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-400/10 text-slate-100"><FileText size={21}/></span>
          <h2 className="mt-4 text-sm font-semibold text-slate-200">Choose an account to view its statement</h2>
          <p className="mt-1 text-xs text-slate-400">Statement activity will appear here after you select an account.</p>
        </section>
      ) : (
        <>
          {statementUnauthorized && <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"><AlertCircle size={16}/><span>This statement is not authorized for your session.</span><Link href="/login" className="font-semibold underline">Sign in again</Link></div>}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Statement balances">
            <StatementMetric label="Opening balance" value={data ? moneyLabel(data.openingBalance) : undefined} detail="Balance at the start of the selected period" icon={Wallet} loading={statementQuery.isLoading && !data}/>
            <StatementMetric label="Closing balance" value={data ? moneyLabel(data.closingBalance) : undefined} detail="Balance at the end of the selected period" icon={Wallet} tone="green" loading={statementQuery.isLoading && !data}/>
            <StatementMetric label="Total debit" value={totalsAreCurrent && totals.status === "success" ? paisaLabel(totals.debitPaisa) : undefined} detail="All debits in the selected period" icon={ArrowUpRight} tone="amber" loading={totalsLoading}/>
            <StatementMetric label="Total credit" value={totalsAreCurrent && totals.status === "success" ? paisaLabel(totals.creditPaisa) : undefined} detail="All credits in the selected period" icon={ArrowDownLeft} tone="blue" loading={totalsLoading}/>
          </section>

          {totalsError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-200"><AlertCircle size={15}/><span>{errorMessage(totalsError, "Could not calculate period totals.")}</span><button type="button" onClick={retryTotals} className="font-semibold underline">Retry totals</button></div>}

          <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4 sm:px-5">
              <div><h2 className="text-sm font-semibold text-slate-100">Transactions</h2><p className="mt-1 text-[11px] text-slate-400">{appliedDates.startDate || appliedDates.endDate ? `${appliedDates.startDate || "All dates"} to ${appliedDates.endDate || "Present"}` : "All available history"} · completed deposits, withdrawals and transfers</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void downloadStatement("pdf")} disabled={Boolean(downloading)} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#10182b] px-3.5 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/[0.12] hover:bg-white/[0.04] disabled:cursor-wait disabled:opacity-50"><Download size={14}/>{downloading === "pdf" ? "Preparing PDF…" : "Download PDF"}</button>
                <button type="button" onClick={() => void downloadStatement("csv")} disabled={Boolean(downloading)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-50"><Download size={14}/>{downloading === "csv" ? "Preparing CSV…" : "Download CSV"}</button>
              </div>
            </div>

            {statementQuery.isLoading ? <StatementSkeleton/> : statementQuery.isError ? <div role="alert" className="p-10 text-center"><AlertCircle size={18} className="mx-auto text-rose-600"/><p className="mt-3 text-sm font-semibold text-slate-200">{statementUnauthorized ? "Statement access is unavailable" : "Could not load this statement"}</p><p className="mt-1 text-xs text-slate-400">{statementUnauthorized ? "Your session may have expired or this account is not available to your role." : errorMessage(statementQuery.error, "Please try loading the statement again.")}</p><button type="button" onClick={() => void statementQuery.refetch()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200"><RefreshCw size={13}/> Try again</button></div> : data?.transactions.length ? <>
              <TransactionTable transactions={data.transactions}/>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
                <p className="text-xs text-slate-400">{data.total.toLocaleString()} transactions · Page {data.page} of {Math.max(data.totalPages, 1)}</p>
                <div className="flex gap-2"><button type="button" aria-label="Previous statement page" disabled={page <= 1 || statementQuery.isFetching} onClick={() => setPage((value) => value - 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={14}/>Previous</button><button type="button" aria-label="Next statement page" disabled={page >= data.totalPages || statementQuery.isFetching} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight size={14}/></button></div>
              </div>
            </> : <div className="px-5 py-12 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-slate-400"><FileText size={18}/></span><p className="mt-3 text-sm font-semibold text-slate-400">No transactions in this period</p><p className="mt-1 text-xs text-slate-400">The statement still includes the opening and closing balance for the selected dates.</p></div>}
          </section>
        </>
      )}
    </div>
  );
}
