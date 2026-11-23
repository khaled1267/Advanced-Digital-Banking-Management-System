"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, Bell, Check, CheckCheck, CircleDollarSign, HandCoins, LoaderCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notificationHref } from "@/components/NotificationBell";
import { useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation, useNotificationsQuery, type NotificationType } from "@/store/notificationsApi";

const iconByType: Record<NotificationType, typeof Bell> = { MONEY_RECEIVED: CircleDollarSign, TRANSFER_COMPLETED: ArrowLeftRight, DEPOSIT_APPROVED: ArrowDownLeft, WITHDRAWAL_REJECTED: ShieldAlert, LOAN_APPROVED: HandCoins, LOAN_REJECTED: ShieldAlert };

export function NotificationCenter() {
  const [status, setStatus] = useState<"all" | "unread" | "read">("all");
  const [page, setPage] = useState(1);
  const query = useNotificationsQuery({ page, limit: 10, status }, { refetchOnFocus: true });
  const [markRead, markReadState] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();
  const result = query.data?.data;

  return <section className="mx-auto max-w-4xl px-4 py-7 sm:px-7 lg:px-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">Account activity</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Notifications</h1><p className="mt-1 text-sm text-slate-400">Important updates about your banking activity.</p></div><button type="button" onClick={() => markAll()} disabled={!result?.unreadCount || markAllState.isLoading} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] disabled:opacity-40"><CheckCheck size={15} />Mark all as read</button></div>
    <div className="mt-6 flex gap-2" role="tablist" aria-label="Notification status">{(["all", "unread", "read"] as const).map((item) => <button key={item} role="tab" aria-selected={status === item} type="button" onClick={() => { setStatus(item); setPage(1); }} className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition ${status === item ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20" : "text-slate-400 hover:bg-white/[0.05]"}`}>{item}{item === "unread" && result?.unreadCount ? ` (${result.unreadCount})` : ""}</button>)}</div>
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10182b]">
      {query.isLoading ? <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={18} />Loading notifications…</div>
        : query.isError ? <div className="px-6 py-14 text-center"><p role="alert" className="text-sm text-rose-300">Could not load notifications.</p><button type="button" onClick={() => query.refetch()} className="mt-3 text-xs font-semibold text-blue-300 underline">Try again</button></div>
          : result?.notifications.length ? <div>{result.notifications.map((item) => {
            const Icon = iconByType[item.type];
            return <article key={item.id} className={`flex gap-3 border-b border-white/[0.06] px-4 py-4 last:border-0 sm:gap-4 sm:px-6 ${item.isRead ? "" : "bg-blue-400/[0.045]"}`}>
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.isRead ? "bg-white/[0.04] text-slate-400" : "bg-blue-400/10 text-blue-300"}`}><Icon size={18} /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-slate-100">{item.title}</h2>{!item.isRead && <span className="rounded-full bg-blue-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-300">Unread</span>}</div><p className="mt-1 text-xs leading-5 text-slate-400">{item.message}</p><time className="mt-2 block text-[10px] text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-BD", { dateStyle: "full", timeStyle: "short" })}</time><Link href={notificationHref(item)} className="mt-2 inline-flex text-[11px] font-semibold text-blue-300 hover:text-blue-200">View related activity</Link></div>
              {!item.isRead && <button type="button" onClick={() => markRead(item.id)} disabled={markReadState.isLoading} aria-label={`Mark ${item.title} as read`} className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-blue-300 disabled:opacity-40"><Check size={16} /></button>}
            </article>;
          })}</div> : <div className="px-6 py-16 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-500"><Bell size={20} /></span><h2 className="mt-4 text-sm font-semibold text-slate-200">You&apos;re all caught up!</h2><p className="mt-1 text-xs text-slate-500">There are no {status === "all" ? "notifications" : `${status} notifications`} to show.</p></div>}
    </div>
    {result && result.totalPages > 1 && <div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>{result.total.toLocaleString("en-BD")} notifications · Page {page} of {result.totalPages}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1} className="rounded-lg border border-white/[0.08] px-3 py-2 disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= result.totalPages} className="rounded-lg border border-white/[0.08] px-3 py-2 disabled:opacity-40">Next</button></div></div>}
  </section>;
}
