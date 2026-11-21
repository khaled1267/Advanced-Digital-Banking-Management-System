import { baseApi } from "@/store/api";
import type { AccountStatus } from "@/store/bankAccountsApi";

export type DepositStatus = "PENDING" | "APPROVED" | "REJECTED";
export type DepositRecord = {
  id: string;
  depositId: string;
  amount: string;
  currency: "BDT";
  status: DepositStatus;
  description?: string;
  rejectionReason?: string;
  transactionId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; maskedAccountNumber: string; accountType: string; status: AccountStatus } | null;
  customer?: { id: string; name: string; email: string } | null;
};

export type DepositsQuery = {
  search?: string;
  status?: DepositStatus;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
};

export type DepositSummary = { total: number; pending: number; approved: number; rejected: number };
type DepositListResponse = {
  status: "success";
  data: { deposits: DepositRecord[]; total: number; page: number; limit: number; totalPages: number; summary: DepositSummary };
};
type DepositDetailsResponse = { status: "success"; data: { deposit: DepositRecord } };
type CreateDepositResponse = {
  status: "success";
  data: { deposit: Pick<DepositRecord, "id" | "depositId" | "amount" | "currency" | "status" | "createdAt"> & { description?: string } };
};
type CreateDepositInput = { accountId: string; amount: string; description?: string };
type ReviewDepositInput =
  | { id: string; action: "APPROVE" }
  | { id: string; action: "REJECT"; rejectionReason: string };

export const depositsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createDepositRequest: build.mutation<CreateDepositResponse, CreateDepositInput>({
      query: (body) => ({ url: "/deposits", method: "POST", body }),
      invalidatesTags: [{ type: "Deposits", id: "MY_LIST" }],
    }),
    getMyDeposits: build.query<DepositListResponse, Pick<DepositsQuery, "status" | "page" | "limit">>({
      query: (params) => ({ url: "/deposits", params }),
      providesTags: (result) => [
        { type: "Deposits", id: "MY_LIST" },
        ...(result?.data.deposits.map((deposit) => ({ type: "Deposits" as const, id: deposit.id })) ?? []),
      ],
    }),
    getMyDepositById: build.query<DepositDetailsResponse, string>({
      query: (id) => `/deposits/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Deposits", id }],
    }),
    getAdminDeposits: build.query<DepositListResponse, DepositsQuery>({
      query: (params) => ({ url: "/admin/deposits", params }),
      providesTags: (result) => [
        { type: "Deposits", id: "ADMIN_LIST" },
        ...(result?.data.deposits.map((deposit) => ({ type: "Deposits" as const, id: deposit.id })) ?? []),
      ],
    }),
    getAdminDepositById: build.query<DepositDetailsResponse, string>({
      query: (id) => `/admin/deposits/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Deposits", id }],
    }),
    reviewDeposit: build.mutation<DepositDetailsResponse, ReviewDepositInput>({
      query: ({ id, ...body }) => ({ url: `/admin/deposits/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, error, { id, action }) => error ? [] : [
        { type: "Deposits", id },
        { type: "Deposits", id: "ADMIN_LIST" },
        { type: "Deposits", id: "MY_LIST" },
        ...(action === "APPROVE" ? [
          { type: "BankAccounts" as const, id: "LIST" },
          { type: "BankAccounts" as const, id: "MINE" },
          ...(result?.data.deposit.account ? [{ type: "BankAccounts" as const, id: result.data.deposit.account.id }] : []),
          { type: "Transactions" as const, id: "ADMIN_LIST" },
          { type: "Transactions" as const, id: "MY_LIST" },
          ...(result?.data.deposit.transactionId ? [{ type: "Transactions" as const, id: result.data.deposit.transactionId }] : []),
        ] : []),
        ...(result?.data.deposit ? [{ type: "Deposits" as const, id: result.data.deposit.id }] : []),
      ],
    }),
  }),
});

export const {
  useCreateDepositRequestMutation,
  useGetMyDepositsQuery,
  useGetMyDepositByIdQuery,
  useGetAdminDepositsQuery,
  useGetAdminDepositByIdQuery,
  useReviewDepositMutation,
} = depositsApi;
