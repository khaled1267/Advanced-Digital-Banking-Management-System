import { baseApi } from "@/store/api";

export type AccountStatementQuery = {
  accountId: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
};

export type AccountStatementTransaction = {
  id: string;
  transactionId: string;
  transactionType: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "LOAN_DISBURSEMENT" | "LOAN_REPAYMENT";
  direction: "DEBIT" | "CREDIT";
  description: string;
  amount: string;
  debit: string;
  credit: string;
  balance: string;
  createdAt: string;
};

export type AccountStatementResponse = {
  status: "success";
  data: {
    account: {
      id: string;
      accountNumber: string;
      accountType: "SAVINGS" | "CURRENT";
      currency: "BDT";
    };
    period: { startDate: string | null; endDate: string | null };
    openingBalance: string;
    closingBalance: string;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    transactions: AccountStatementTransaction[];
  };
};

export const accountStatementsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAccountStatement: build.query<AccountStatementResponse, AccountStatementQuery>({
      query: ({ accountId, ...params }) => ({
        url: `/accounts/${accountId}/statement`,
        params,
      }),
    }),
  }),
});

export const {
  useGetAccountStatementQuery,
  useLazyGetAccountStatementQuery,
} = accountStatementsApi;
