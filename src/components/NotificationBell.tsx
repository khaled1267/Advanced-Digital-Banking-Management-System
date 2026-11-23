"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, Bell, CheckCheck, CircleDollarSign, HandCoins, LoaderCircle, ShieldAlert } from "lucide-react";
import { useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation, useNotificationsQuery, type CustomerNotification, type NotificationType } from "@/store/notificationsApi";

const typeIcon: Record<NotificationType, typeof Bell> = {
  MONEY_RECEIVED: CircleDollarSign,
  TRANSFER_COMPLETED: ArrowLeftRight,
  DEPOSIT_APPROVED: ArrowDownLeft,
  WITHDRAWAL_REJECTED: ShieldAlert,
  LOAN_APPROVED: HandCoins,
  LOAN_REJECTED: ShieldAlert,
};

export function notificationHref(notification: CustomerNotification) {
  if (notification.relatedEntityType === "loan") return "/loans";
  if (notification.relatedEntityType === "deposit") return "/deposit";
  if (notification.relatedEntityType === "withdrawal") return "/withdrawal";
  return "/transactions";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const query = useNotificationsQuery({ page: 1, limit: 5, status: "all" }, { pollingInterval: 60_000, refetchOnFocus: true });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();
  const unreadCount = query.data?.data.unreadCount ?? 0;

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  return <div ref={rootRef} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label={`Notifications${query.isError && !query.data ? ", unread count unavailable" : unreadCount ? `, ${unreadCount} unread` : ", no unread notifications"}`} aria-expanded={open} aria-haspopup="dialog" className="dashboard-interactive relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
      <Bell size={19} />
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#050610] bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section role="dialog" aria-label="Recent notifications" className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#10182b] text-slate-200 shadow-2xl shadow-black/30">
      <header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div><h2 className="text-sm font-semibold text-slate-100">Notifications</h2><p className="mt-0.5 text-[11px] text-slate-500">{unreadCount ? `${unreadCount} unread` : "You're all caught up!"}</p></div>
        <button type="button" onClick={() => markAll()} disabled={!unreadCount || markAllState.isLoading} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-blue-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"><CheckCheck size={14} />Mark all read</button>
      </header>
      <div className="max-h-[min(26rem,65vh)] overflow-y-auto">
        {query.isLoading ? <div className="flex items-center justify-center gap-2 px-5 py-10 text-xs text-slate-400"><LoaderCircle className="animate-spin" size={16} />Loading notifications…</div>
          : query.isError ? <div role="alert" className="px-5 py-8 text-center text-xs text-rose-300">Could not load notifications. <button type="button" onClick={() => query.refetch()} className="underline">Retry</button></div>
          : query.data?.data.notifications.length ? query.data.data.notifications.map((item) => {
            const Icon = typeIcon[item.type];
            return <Link key={item.id} href={notificationHref(item)} onClick={() => { if (!item.isRead) void markRead(item.id); setOpen(false); }} className={`flex gap-3 border-b border-white/[0.05] px-4 py-3 transition hover:bg-white/[0.04] ${item.isRead ? "opacity-75" : "bg-blue-400/[0.06]"}`}>
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.isRead ? "bg-white/[0.05] text-slate-400" : "bg-blue-400/10 text-blue-300"}`}><Icon size={17} /></span>
              <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><strong className="text-xs font-semibold text-slate-100">{item.title}</strong>{!item.isRead && <i className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />}</span><span className="mt-1 block text-[11px] leading-4 text-slate-400">{item.message}</span><time className="mt-1.5 block text-[10px] text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</time></span>
            </Link>;
          }) : <div className="px-5 py-10 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-500"><Bell size={19} /></span><p className="mt-3 text-sm font-medium text-slate-200">You&apos;re all caught up!</p><p className="mt-1 text-xs text-slate-500">New account updates will show up here.</p></div>}
      </div>
      <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-white/[0.08] px-4 py-3 text-center text-xs font-semibold text-blue-300 transition hover:bg-white/[0.04]">View all notifications</Link>
    </section>}
  </div>;
}
