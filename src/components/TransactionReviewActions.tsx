"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock3, FileSearch, Flag, LoaderCircle } from "lucide-react";
import { useFlagSuspiciousTransactionMutation, useGetTransactionReviewQuery, useUpdateTransactionReviewMutation, type ReviewTargetType } from "@/store/transactionReviewsApi";
import type { SuspiciousFlagReason } from "@/store/transactionsApi";

const reasons: Array<{ value: SuspiciousFlagReason; label: string }> = [
  { value: "UNUSUAL_AMOUNT", label: "Unusual amount" },
  { value: "UNUSUAL_ACTIVITY", label: "Unusual activity" },
  { value: "DUPLICATE_PATTERN", label: "Possible duplicate pattern" },
  { value: "ACCOUNT_CONCERN", label: "Account concern" },
  { value: "OTHER", label: "Other" },
];
const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#0b1020] px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10";

function message(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error && typeof error.data === "object" && error.data !== null && "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "The review action could not be completed. Try again.";
}

export function TransactionReviewActions({ targetType, targetId, canStaffReview = true }: { targetType: ReviewTargetType; targetId: string; canStaffReview?: boolean }) {
  const target = { targetType, targetId };
  const query = useGetTransactionReviewQuery(target);
  const [updateReview, updateState] = useUpdateTransactionReviewMutation();
  const [flagSuspicious, flagState] = useFlagSuspiciousTransactionMutation();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<SuspiciousFlagReason>("UNUSUAL_ACTIVITY");
  const [explanation, setExplanation] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const result = query.data?.data;
  const busy = updateState.isLoading || flagState.isLoading;

  async function act(action: "START_REVIEW" | "ADD_NOTE" | "COMPLETE_REVIEW") {
    if (action === "COMPLETE_REVIEW" && !window.confirm("Complete this review? The financial record will remain unchanged.")) return;
    setFeedback(""); setError("");
    try {
      const body = action === "ADD_NOTE"
        ? { ...target, action, note: note.trim() }
        : { ...target, action, ...(note.trim() ? { note: note.trim() } : {}) };
      await updateReview(body).unwrap();
      setFeedback(action === "COMPLETE_REVIEW" ? "Review completed." : action === "START_REVIEW" ? "Review started." : "Review note saved.");
      setNote("");
    } catch (reasonValue: unknown) { setError(message(reasonValue)); }
  }

  async function flag() {
    if (!window.confirm("Flag this item for Admin review? This records a review signal only; it does not reverse or block a transaction.")) return;
    setFeedback(""); setError("");
    try {
      await flagSuspicious({ ...target, reason, ...(explanation.trim() ? { explanation: explanation.trim() } : {}) }).unwrap();
      setFeedback("Flagged for Admin Review.");
      setExplanation("");
    } catch (reasonValue: unknown) { setError(message(reasonValue)); }
  }

  return <section className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4" aria-labelledby={`review-heading-${targetId}`}>
    <div className="flex items-start justify-between gap-3"><div><h3 id={`review-heading-${targetId}`} className="flex items-center gap-2 text-xs font-semibold text-slate-100"><FileSearch size={14} className="text-blue-300"/>Staff review</h3><p className="mt-1 text-[10px] text-slate-500">Review actions do not change the financial status, amount, or account balance.</p></div>{result && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[9px] font-semibold text-slate-300">{result.review.status.replaceAll("_", " ")}</span>}</div>
    {query.isLoading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={13} className="animate-spin"/>Loading review information…</p>
      : query.isError ? <div className="mt-3"><p role="alert" className="text-xs text-rose-200">{message(query.error)}</p><button type="button" onClick={() => void query.refetch()} className="mt-1 text-[10px] font-semibold text-blue-200">Try again</button></div>
        : result && <>
          {result.review.note && <p className="mt-3 rounded-lg bg-white/[0.035] px-3 py-2.5 text-xs leading-5 text-slate-300"><span className="font-semibold text-slate-200">Latest review note: </span>{result.review.note}</p>}
          {result.flag && <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-amber-100"><AlertTriangle size={14}/>Flagged for Admin Review · {result.flag.status.replaceAll("_", " ")}</p><p className="mt-1.5 text-[10px] text-amber-100/70">{reasons.find((item) => item.value === result.flag?.reason)?.label} · {new Date(result.flag.flaggedAt).toLocaleString()}{result.flag.flaggedBy ? ` · ${result.flag.flaggedBy.name}` : ""}</p>{result.flag.explanation && <p className="mt-2 text-xs leading-5 text-slate-300">{result.flag.explanation}</p>}</div>}
          {result.review.history.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[10px] font-semibold text-slate-400">Review history ({result.review.history.length})</summary><ol className="mt-2 space-y-2 border-l border-white/[0.08] pl-3">{[...result.review.history].reverse().slice(0, 6).map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="text-[10px] leading-4 text-slate-500"><span className="font-medium text-slate-300">{entry.action.replaceAll("_", " ")}</span>{entry.actor ? ` · ${entry.actor.name}` : ""} · {new Date(entry.createdAt).toLocaleString()}{entry.note && <p className="mt-0.5 text-slate-400">{entry.note}</p>}</li>)}</ol></details>}
          {canStaffReview && result.review.status !== "REVIEWED" && <div className="mt-4 space-y-3">
            <label className="block text-[10px] font-medium text-slate-400">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Record the review context" className={`${inputClass} mt-1.5 resize-y`}/></label>
            <div className="flex flex-wrap justify-end gap-2">{result.review.status === "NOT_REVIEWED" ? <button type="button" disabled={busy} onClick={() => void act("START_REVIEW")} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/15 px-3 py-2 text-[10px] font-semibold text-blue-200 disabled:opacity-50"><Clock3 size={13}/>Start review</button> : <><button type="button" disabled={busy || note.trim().length < 3} onClick={() => void act("ADD_NOTE")} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[10px] font-semibold text-slate-300 disabled:opacity-40">Save note</button><button type="button" disabled={busy} onClick={() => void act("COMPLETE_REVIEW")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50"><Check size={13}/>Complete review</button></>}</div>
          </div>}
          {canStaffReview && (!result.flag || !result.flag.active) && <div className="mt-4 border-t border-white/[0.06] pt-4"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300"><Flag size={13} className="text-amber-200"/>Suspicious activity review signal</p><div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><select aria-label="Flag reason" className={inputClass} value={reason} onChange={(event) => setReason(event.target.value as SuspiciousFlagReason)}>{reasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input className={inputClass} value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={500} placeholder="Optional explanation" aria-label="Optional flag explanation"/></div><div className="mt-2 flex justify-end"><button type="button" disabled={busy} onClick={() => void flag()} className="rounded-lg border border-amber-300/15 px-3 py-2 text-[10px] font-semibold text-amber-100 hover:bg-amber-300/[0.05] disabled:opacity-50">Flag for Admin Review</button></div></div>}
        </>}
    {(feedback || error) && <p role={error ? "alert" : "status"} className={`mt-3 text-[10px] ${error ? "text-rose-200" : "text-emerald-200"}`}>{error || feedback}</p>}
  </section>;
}
