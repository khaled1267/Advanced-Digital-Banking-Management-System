import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v1", credentials: "include" }),
  tagTypes: ["Auth", "AdminUsers", "BankAccounts", "Transactions", "Deposits", "Withdrawals", "Transfers", "Loans", "LoanRepayments", "Notifications"],
  endpoints: () => ({}),
});
