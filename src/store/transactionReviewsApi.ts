import { baseApi } from "@/store/api";
import type { SuspiciousFlagReason, SuspiciousFlagStatus, TransactionReviewStatus } from "@/store/transactionsApi";

export type ReviewTargetType = "TRANSACTION" | "DEPOSIT_REQUEST" | "WITHDRAWAL_REQUEST";
export type ReviewTarget = {
  targetType: ReviewTargetType;
  targetId: string;
  reference: string;
  transactionType: string;
  amount: string;
  currency: "BDT";
  financialStatus: string;
  createdAt: string;
  fromAccount: { maskedAccountNumber: string } | null;
  toAccount: { maskedAccountNumber: string } | null;
  description?: string;
};
type Actor = { id: string; name: string; role: string } | null;
export type ReviewHistoryEntry = { action: string; previousStatus: string | null; newStatus: string | null; note: string | null; createdAt: string; actor: Actor };
export type CurrentTransactionReview = { status: TransactionReviewStatus; note: string | null; updatedAt: string | null; history: ReviewHistoryEntry[] };
export type CurrentSuspiciousFlag = { status: SuspiciousFlagStatus; active: boolean; reason: SuspiciousFlagReason; explanation: string | null; flaggedAt: string; flaggedBy: Actor; reviewedAt?: string | null; adminReviewNote?: string | null; history?: ReviewHistoryEntry[] } | null;
export type TransactionReviewResult = { target: ReviewTarget; review: CurrentTransactionReview; flag: CurrentSuspiciousFlag };

type TargetInput = { targetType: ReviewTargetType; targetId: string };
type ReviewMutation = TargetInput & (
  | { action: "START_REVIEW"; note?: string }
  | { action: "ADD_NOTE"; note: string }
  | { action: "COMPLETE_REVIEW"; note?: string }
);
type FlagMutation = TargetInput & { reason: SuspiciousFlagReason; explanation?: string };
export type SuspiciousFlagQuery = {
  search?: string;
  targetType?: ReviewTargetType | "";
  status?: SuspiciousFlagStatus | "";
  reason?: SuspiciousFlagReason | "";
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
};
export type SuspiciousFlagRecord = {
  id: string;
  targetType: ReviewTargetType;
  targetId: string;
  target: ReviewTarget | null;
  staffReview: { status: TransactionReviewStatus; note: string | null; history: ReviewHistoryEntry[] } | null;
  reason: SuspiciousFlagReason;
  explanation: string | null;
  status: SuspiciousFlagStatus;
  active: boolean;
  flaggedAt: string;
  flaggedBy: Actor;
  reviewedAt: string | null;
  reviewedBy: Actor;
  adminReviewNote: string | null;
  history: ReviewHistoryEntry[];
};
type FlagQueueResponse = { status: "success"; data: { flags: SuspiciousFlagRecord[]; total: number; page: number; limit: number; totalPages: number } };

export const transactionReviewsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTransactionReview: build.query<{ status: "success"; data: TransactionReviewResult }, TargetInput>({
      query: ({ targetType, targetId }) => ({ url: "/transaction-reviews", params: { targetType, targetId } }),
      providesTags: (_result, _error, target) => [{ type: "TransactionReviews", id: `${target.targetType}:${target.targetId}` }],
    }),
    updateTransactionReview: build.mutation<{ status: "success"; data: TransactionReviewResult }, ReviewMutation>({
      query: (body) => ({ url: "/transaction-reviews", method: "POST", body }),
      invalidatesTags: (_result, _error, target) => [
        { type: "TransactionReviews", id: `${target.targetType}:${target.targetId}` },
        { type: "Transactions", id: "ADMIN_LIST" },
      ],
    }),
    flagSuspiciousTransaction: build.mutation<{ status: "success"; data: TransactionReviewResult }, FlagMutation>({
      query: (body) => ({ url: "/suspicious-transaction-flags", method: "POST", body }),
      invalidatesTags: (_result, _error, target) => [
        { type: "TransactionReviews", id: `${target.targetType}:${target.targetId}` },
        "SuspiciousFlags",
        { type: "Transactions", id: "ADMIN_LIST" },
      ],
    }),
    getSuspiciousFlags: build.query<FlagQueueResponse, SuspiciousFlagQuery>({
      query: ({ targetType, status, reason, ...params }) => ({
        url: "/admin/suspicious-transactions",
        params: { ...params, ...(targetType ? { targetType } : {}), ...(status ? { status } : {}), ...(reason ? { reason } : {}) },
      }),
      providesTags: (result) => ["SuspiciousFlags", ...(result?.data.flags.map((flag) => ({ type: "SuspiciousFlags" as const, id: flag.id })) ?? [])],
    }),
    reviewSuspiciousFlag: build.mutation<{ status: "success"; data: { flag: { id: string; status: SuspiciousFlagStatus; active: boolean; reviewedAt: string | null; adminReviewNote: string | null } } }, { id: string; status: "UNDER_REVIEW" | "RESOLVED" | "DISMISSED"; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/suspicious-transactions/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => ["SuspiciousFlags", { type: "SuspiciousFlags", id }],
    }),
  }),
});

export const {
  useGetTransactionReviewQuery,
  useUpdateTransactionReviewMutation,
  useFlagSuspiciousTransactionMutation,
  useGetSuspiciousFlagsQuery,
  useReviewSuspiciousFlagMutation,
} = transactionReviewsApi;
