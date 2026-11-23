import { baseApi } from "@/store/api";

export type AccountType = "SAVINGS" | "CURRENT";
export type AccountStatus = "ACTIVE" | "INACTIVE" | "FROZEN" | "CLOSED";
export type AccountTransactionLimits = {
  dailyTransferLimit: string | null;
  maximumSingleTransferAmount: string | null;
  minimumBalance: string | null;
};

export type BankAccount = {
  id: string;
  accountNumber: string;
  accountType: AccountType;
  balance: string;
  transactionLimits?: AccountTransactionLimits;
  limitsUpdatedBy?: string | { id?: string; name: string } | null;
  limitsUpdatedAt?: string | null;
  currency: "BDT";
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  accountHolder?: { id: string; name: string; email: string } | null;
};

export type AdminAccountsQuery = {
  search?: string;
  accountType?: AccountType;
  status?: AccountStatus;
  page: number;
  limit: number;
};

export type AccountHolder = { id: string; name: string; email: string };
type AdminAccountsResponse = {
  status: "success";
  data: { accounts: BankAccount[]; total: number; page: number; totalPages: number; limit: number };
};
type AccountResponse = { status: "success"; data: { account: BankAccount } };
type MyAccountsResponse = { status: "success"; data: { accounts: BankAccount[] } };
type AccountHoldersResponse = { status: "success"; data: { users: AccountHolder[] } };

export const bankAccountsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminAccounts: build.query<AdminAccountsResponse, AdminAccountsQuery>({
      query: (params) => ({ url: "/admin/accounts", params }),
      providesTags: (result) => [
        { type: "BankAccounts", id: "LIST" },
        ...(result?.data.accounts.map((account) => ({ type: "BankAccounts" as const, id: account.id })) ?? []),
      ],
    }),
    getAdminAccountById: build.query<AccountResponse, string>({
      query: (id) => `/admin/accounts/${id}`,
      providesTags: (_result, _error, id) => [{ type: "BankAccounts", id }],
    }),
    createAdminAccount: build.mutation<AccountResponse, { userId: string; accountType: AccountType }>({
      query: (body) => ({ url: "/admin/accounts", method: "POST", body }),
      invalidatesTags: [{ type: "BankAccounts", id: "LIST" }],
    }),
    updateAdminAccountStatus: build.mutation<AccountResponse, { id: string; status: AccountStatus }>({
      query: ({ id, status }) => ({ url: `/admin/accounts/${id}`, method: "PATCH", body: { status } }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "BankAccounts", id },
        { type: "BankAccounts", id: "LIST" },
      ],
    }),
    updateAdminAccountLimits: build.mutation<AccountResponse, { id: string; dailyTransferLimit: string | null; maximumSingleTransferAmount: string | null; minimumBalance: string | null }>({
      query: ({ id, ...body }) => ({ url: `/admin/accounts/${id}/limits`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "BankAccounts", id },
        { type: "BankAccounts", id: "LIST" },
        { type: "BankAccounts", id: "MINE" },
      ],
    }),
    getAccountHolders: build.query<AccountHoldersResponse, { search?: string }>({
      query: (params) => ({ url: "/admin/accounts/customers", params }),
      providesTags: ["BankAccounts"],
    }),
    getMyAccounts: build.query<MyAccountsResponse, void>({
      query: () => "/accounts",
      providesTags: [{ type: "BankAccounts", id: "MINE" }],
    }),
    getMyAccountById: build.query<AccountResponse, string>({
      query: (id) => `/accounts/${id}`,
      providesTags: (_result, _error, id) => [{ type: "BankAccounts", id }],
    }),
  }),
});

export const {
  useGetAdminAccountsQuery,
  useGetAdminAccountByIdQuery,
  useCreateAdminAccountMutation,
  useUpdateAdminAccountStatusMutation,
  useUpdateAdminAccountLimitsMutation,
  useGetAccountHoldersQuery,
  useGetMyAccountsQuery,
  useGetMyAccountByIdQuery,
} = bankAccountsApi;
