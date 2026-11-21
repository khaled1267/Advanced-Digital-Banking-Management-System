import { baseApi } from "@/store/api";
import type { AccountStatus } from "@/store/bankAccountsApi";

export type WithdrawalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type WithdrawalRecord = {
  id: string;
  withdrawalId: string;
  amount: string;
  currency: "BDT";
  status: WithdrawalStatus;
  description?: string;
  rejectionReason?: string;
  transactionId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; maskedAccountNumber: string; accountType: string; status: AccountStatus } | null;
  customer?: { id: string; name: string; email: string } | null;
};

export type WithdrawalsQuery = {
  search?: string;
  status?: WithdrawalStatus;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
};

export type WithdrawalSummary = { total: number; pending: number; approved: number; rejected: number };
type WithdrawalListResponse = {
  status: "success";
  data: { withdrawals: WithdrawalRecord[]; total: number; page: number; limit: number; totalPages: number; summary: WithdrawalSummary };
};
type WithdrawalDetailsResponse = { status: "success"; data: { withdrawal: WithdrawalRecord } };
type CreateWithdrawalResponse = {
  status: "success";
  data: { withdrawal: Pick<WithdrawalRecord, "id" | "withdrawalId" | "amount" | "currency" | "status" | "createdAt"> & { description?: string } };
};
type CreateWithdrawalInput = { accountId: string; amount: string; description?: string };
type ReviewWithdrawalInput =
  | { id: string; action: "APPROVE" }
  | { id: string; action: "REJECT"; rejectionReason: string };

export const withdrawalsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createWithdrawalRequest: build.mutation<CreateWithdrawalResponse, CreateWithdrawalInput>({
      query: (body) => ({ url: "/withdrawals", method: "POST", body }),
      invalidatesTags: [{ type: "Withdrawals", id: "MY_LIST" }],
    }),
    getMyWithdrawals: build.query<WithdrawalListResponse, Pick<WithdrawalsQuery, "status" | "page" | "limit">>({
      query: (params) => ({ url: "/withdrawals", params }),
      providesTags: (result) => [
        { type: "Withdrawals", id: "MY_LIST" },
        ...(result?.data.withdrawals.map((withdrawal) => ({ type: "Withdrawals" as const, id: withdrawal.id })) ?? []),
      ],
    }),
    getMyWithdrawalById: build.query<WithdrawalDetailsResponse, string>({
      query: (id) => "/withdrawals/" + id,
      providesTags: (_result, _error, id) => [{ type: "Withdrawals", id }],
    }),
    getAdminWithdrawals: build.query<WithdrawalListResponse, WithdrawalsQuery>({
      query: (params) => ({ url: "/admin/withdrawals", params }),
      providesTags: (result) => [
        { type: "Withdrawals", id: "ADMIN_LIST" },
        ...(result?.data.withdrawals.map((withdrawal) => ({ type: "Withdrawals" as const, id: withdrawal.id })) ?? []),
      ],
    }),
    getAdminWithdrawalById: build.query<WithdrawalDetailsResponse, string>({
      query: (id) => "/admin/withdrawals/" + id,
      providesTags: (_result, _error, id) => [{ type: "Withdrawals", id }],
    }),
    reviewWithdrawal: build.mutation<WithdrawalDetailsResponse, ReviewWithdrawalInput>({
      query: ({ id, ...body }) => ({ url: "/admin/withdrawals/" + id, method: "PATCH", body }),
      invalidatesTags: (result, error, { id, action }) => error ? [] : [
        { type: "Withdrawals", id },
        { type: "Withdrawals", id: "ADMIN_LIST" },
        { type: "Withdrawals", id: "MY_LIST" },
        ...(action === "APPROVE" ? [
          { type: "BankAccounts" as const, id: "LIST" },
          { type: "BankAccounts" as const, id: "MINE" },
          ...(result?.data.withdrawal.account ? [{ type: "BankAccounts" as const, id: result.data.withdrawal.account.id }] : []),
          { type: "Transactions" as const, id: "ADMIN_LIST" },
          { type: "Transactions" as const, id: "MY_LIST" },
          ...(result?.data.withdrawal.transactionId ? [{ type: "Transactions" as const, id: result.data.withdrawal.transactionId }] : []),
        ] : []),
        ...(result?.data.withdrawal ? [{ type: "Withdrawals" as const, id: result.data.withdrawal.id }] : []),
      ],
    }),
  }),
});

export const {
  useCreateWithdrawalRequestMutation,
  useGetMyWithdrawalsQuery,
  useGetMyWithdrawalByIdQuery,
  useGetAdminWithdrawalsQuery,
  useGetAdminWithdrawalByIdQuery,
  useReviewWithdrawalMutation,
} = withdrawalsApi;
