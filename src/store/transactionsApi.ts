import { baseApi } from "@/store/api";

export type TransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER"
  | "LOAN_DISBURSEMENT"
  | "LOAN_REPAYMENT";
export type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
export type TransactionReviewStatus = "NOT_REVIEWED" | "UNDER_REVIEW" | "REVIEWED";
export type SuspiciousFlagReason = "UNUSUAL_AMOUNT" | "UNUSUAL_ACTIVITY" | "DUPLICATE_PATTERN" | "ACCOUNT_CONCERN" | "OTHER";
export type SuspiciousFlagStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";

export type TransactionRecord = {
  id: string;
  transactionId: string;
  transactionType: TransactionType;
  fromAccount: { id: string; maskedAccountNumber: string } | null;
  toAccount: { id: string; maskedAccountNumber: string } | null;
  amount: string;
  currency: "BDT";
  status: TransactionStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
  review?: { status: TransactionReviewStatus; note: string | null; updatedAt: string | null; updatedBy: { id: string; name: string; role: string } | null };
  suspiciousFlag?: { status: SuspiciousFlagStatus; active: boolean; reason: SuspiciousFlagReason; explanation: string | null; flaggedAt: string; flaggedBy: { id: string; name: string; role: string } | null } | null;
};

export type TransactionsQuery = {
  search?: string;
  transactionType?: TransactionType;
  status?: TransactionStatus;
  reviewStatus?: TransactionReviewStatus;
  suspiciousStatus?: "FLAGGED" | "CLEAR";
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
};

export type TransactionSummary = {
  total: number;
  completed: number;
  pending: number;
  failed: number;
};

type TransactionListResponse = {
  status: "success";
  data: {
    transactions: TransactionRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: TransactionSummary;
  };
};
type TransactionDetailResponse = { status: "success"; data: { transaction: TransactionRecord } };

export const transactionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminTransactions: build.query<TransactionListResponse, TransactionsQuery>({
      query: (params) => ({ url: "/admin/transactions", params }),
      providesTags: (result) => [
        { type: "Transactions", id: "ADMIN_LIST" },
        ...(result?.data.transactions.map((transaction) => ({ type: "Transactions" as const, id: transaction.id })) ?? []),
      ],
    }),
    getAdminTransactionById: build.query<TransactionDetailResponse, string>({
      query: (id) => `/admin/transactions/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Transactions", id }],
    }),
    getMyTransactions: build.query<TransactionListResponse, TransactionsQuery>({
      query: (params) => ({ url: "/transactions", params }),
      providesTags: (result) => [
        { type: "Transactions", id: "MY_LIST" },
        ...(result?.data.transactions.map((transaction) => ({ type: "Transactions" as const, id: transaction.id })) ?? []),
      ],
    }),
    getMyTransactionById: build.query<TransactionDetailResponse, string>({
      query: (id) => `/transactions/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Transactions", id }],
    }),
  }),
});

export const {
  useGetAdminTransactionsQuery,
  useGetAdminTransactionByIdQuery,
  useGetMyTransactionsQuery,
  useGetMyTransactionByIdQuery,
} = transactionsApi;
