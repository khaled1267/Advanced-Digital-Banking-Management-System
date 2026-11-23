import { baseApi } from "@/store/api";

export type AnalyticsRangeQuery = { range: "7d" | "30d" | "90d" | "custom"; startDate?: string; endDate?: string };
export type AnalyticsStatus = { status: string; count: number; approvedAmount: string; disbursedAmount?: string; outstanding?: string };
export type AdminAnalytics = {
  role: "ADMIN"; range: string;
  depositWithdrawal: { date: string; type: "DEPOSIT" | "WITHDRAWAL"; amount: string; count: number }[];
  transactionTypes: { type: string; status: string; amount: string; count: number }[];
  transactionStatuses: Record<string, number>;
  loanStatuses: AnalyticsStatus[];
  repayments: { date: string; amount: string; count: number }[];
  accounts: { type: string; status: string; count: number }[];
};
export type CustomerAnalytics = {
  role: "CUSTOMER"; range: string;
  cashFlow: { date: string; incoming: string; outgoing: string; amount: string; count: number }[];
  transactionStatuses: Record<string, number>;
  accounts: { type: string; status: string; balance: string }[];
  loanStatuses: AnalyticsStatus[];
  repayments: { date: string; amount: string; count: number }[];
};
export type StaffAnalytics = {
  role: "STAFF"; range: string;
  requests: { label: string; count: number }[];
  loanStatuses: { status: string; count: number }[];
};
export type DashboardAnalytics = AdminAnalytics | CustomerAnalytics | StaffAnalytics;
type AnalyticsResponse = { status: "success"; data: DashboardAnalytics };

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDashboardAnalytics: build.query<AnalyticsResponse, AnalyticsRangeQuery>({
      query: (params) => ({ url: "/analytics", params }),
      providesTags: ["Transactions", "Loans", "LoanRepayments", "Deposits", "Withdrawals", "BankAccounts"],
    }),
  }),
});

export const { useGetDashboardAnalyticsQuery } = analyticsApi;
