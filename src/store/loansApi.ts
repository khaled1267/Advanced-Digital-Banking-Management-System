import { baseApi } from "@/store/api";

export type LoanStatus = "PENDING" | "FORWARDED_TO_ADMIN" | "APPROVED" | "REJECTED" | "DISBURSED" | "PAID";

export type LoanRecord = {
  id: string;
  loanId: string;
  amount: string;
  approvedAmount: string | null;
  disbursedAmount: string | null;
  outstandingBalance: string | null;
  currency: "BDT";
  purpose: string;
  loanType: string | null;
  monthlyIncome: string | null;
  employmentStatus: string | null;
  durationMonths: number;
  status: LoanStatus;
  rejectionReason?: string;
  reviewNotes?: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  disbursedAt: string | null;
  disbursement: { transactionId: string; amount: string; currency: "BDT"; createdAt: string } | null;
  schedule: LoanInstallmentRecord[] | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; maskedAccountNumber: string; accountType: string; status: string } | null;
  customer?: { id: string; name: string; email: string } | null;
  reviewer?: { id: string; name: string; email: string } | null;
};

export type LoanInstallmentRecord = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalAmountDue: string;
  interestAmountDue: string;
  totalAmountDue: string;
  amountPaid: string;
  remainingAmount: string;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
  paidAt: string | null;
  lastPaymentAt: string | null;
};

export type LoanListQuery = {
  search?: string;
  status?: LoanStatus;
  page: number;
  limit: number;
};

export type LoanListResponse = {
  status: "success";
  data: { loans: LoanRecord[]; total: number; page: number; limit: number; totalPages: number };
};

export type LoanDetailsResponse = { status: "success"; data: { loan: LoanRecord } };

export type LoanSummaryResponse = {
  status: "success";
  data: {
    totalLoans: number;
    pendingLoans: number;
    approvedLoans: number;
    disbursedLoans: number;
    paidLoans: number;
    outstandingBalance: string;
  };
};

export type LoanRepaymentRecord = {
  id: string;
  repaymentId: string;
  loanId: string;
  amount: string;
  outstandingBalanceAfter: string;
  currency: "BDT";
  status: "COMPLETED";
  createdAt: string;
  sourceAccount: { id: string; maskedAccountNumber: string } | null;
  transaction: {
    id: string;
    transactionId: string;
    amount: string;
    currency: "BDT";
    status: "COMPLETED";
    createdAt: string;
  } | null;
  customer?: { id: string; name: string; email: string } | null;
};

export type LoanRepaymentHistoryResponse = {
  status: "success";
  data: { repayments: LoanRepaymentRecord[]; total: number; page: number; limit: number; totalPages: number };
};

export type CreateLoanInput = {
  accountId: string;
  amount: string;
  purpose: string;
  loanType: string;
  monthlyIncome: string;
  employmentStatus: string;
  durationMonths: number;
};

export type ForwardLoanInput = {
  id: string;
  action: "FORWARD_TO_ADMIN";
  reviewNotes: string;
};

export type ApproveLoanInput = { id: string; approvedAmount: string };
export type RejectLoanInput = { id: string; rejectionReason: string };
export type DisburseLoanResponse = {
  status: "success";
  data: {
    loan: LoanRecord;
    transaction: { id: string; transactionId: string; transactionType: "LOAN_DISBURSEMENT"; amount: string; currency: "BDT"; status: "COMPLETED"; createdAt: string };
  };
};

export type CreateLoanRepaymentInput = {
  id: string;
  amount: string;
  sourceAccountId: string;
  idempotencyKey: string;
};

export type LoanRepaymentResponse = {
  status: "success";
  data: { repayment: LoanRepaymentRecord; outstandingBalance: string; replayed: boolean };
};

export type LoanRepaymentHistoryQuery = { id: string; page: number; limit: number };

function invalidateLoanLists(id: string) {
  return [
    { type: "Loans" as const, id },
    { type: "Loans" as const, id: "MY_LIST" },
    { type: "Loans" as const, id: "STAFF_LIST" },
    { type: "Loans" as const, id: "ADMIN_LIST" },
    { type: "Loans" as const, id: "MY_SUMMARY" },
  ];
}

export const loansApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createLoanApplication: build.mutation<LoanDetailsResponse, CreateLoanInput>({
      query: (body) => ({ url: "/loans", method: "POST", body }),
      invalidatesTags: (_result, error) => error ? [] : [
        { type: "Loans", id: "MY_LIST" },
        { type: "Loans", id: "MY_SUMMARY" },
        { type: "Loans", id: "STAFF_LIST" },
        { type: "Loans", id: "ADMIN_LIST" },
      ],
    }),
    getMyLoans: build.query<LoanListResponse, Pick<LoanListQuery, "status" | "page" | "limit">>({
      query: (params) => ({ url: "/loans", params }),
      providesTags: (result) => [
        { type: "Loans", id: "MY_LIST" },
        ...(result?.data.loans.map((loan) => ({ type: "Loans" as const, id: loan.id })) ?? []),
      ],
    }),
    getMyLoanSummary: build.query<LoanSummaryResponse, void>({
      query: () => "/loans/summary",
      providesTags: [{ type: "Loans", id: "MY_SUMMARY" }],
    }),
    getMyLoanById: build.query<LoanDetailsResponse, string>({
      query: (id) => `/loans/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Loans", id }],
    }),
    getMyLoanRepayments: build.query<LoanRepaymentHistoryResponse, LoanRepaymentHistoryQuery>({
      query: ({ id, ...params }) => ({ url: `/loans/${id}/repayments`, params }),
      providesTags: (result, _error, { id }) => [
        { type: "LoanRepayments", id: `CUSTOMER:${id}` },
        ...(result?.data.repayments.map((repayment) => ({ type: "LoanRepayments" as const, id: repayment.id })) ?? []),
      ],
    }),
    createLoanRepayment: build.mutation<LoanRepaymentResponse, CreateLoanRepaymentInput>({
      query: ({ id, ...body }) => ({ url: `/loans/${id}/repayments`, method: "POST", body }),
      invalidatesTags: (_result, error, { id }) => error ? [] : [
        ...invalidateLoanLists(id),
        { type: "LoanRepayments", id: `CUSTOMER:${id}` },
        { type: "BankAccounts", id: "MINE" },
        { type: "Transactions", id: "MY_LIST" },
      ],
    }),
    getStaffLoans: build.query<LoanListResponse, LoanListQuery>({
      query: (params) => ({ url: "/staff/loans", params }),
      providesTags: (result) => [
        { type: "Loans", id: "STAFF_LIST" },
        ...(result?.data.loans.map((loan) => ({ type: "Loans" as const, id: loan.id })) ?? []),
      ],
    }),
    getStaffLoanById: build.query<LoanDetailsResponse, string>({
      query: (id) => `/staff/loans/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Loans", id }],
    }),
    forwardLoanToAdmin: build.mutation<LoanDetailsResponse, ForwardLoanInput>({
      query: ({ id, ...body }) => ({ url: `/staff/loans/${id}/review`, method: "PATCH", body }),
      invalidatesTags: (_result, error, { id }) => error ? [] : invalidateLoanLists(id),
    }),
    getAdminLoans: build.query<LoanListResponse, LoanListQuery>({
      query: (params) => ({ url: "/admin/loans", params }),
      providesTags: (result) => [
        { type: "Loans", id: "ADMIN_LIST" },
        ...(result?.data.loans.map((loan) => ({ type: "Loans" as const, id: loan.id })) ?? []),
      ],
    }),
    getAdminLoanById: build.query<LoanDetailsResponse, string>({
      query: (id) => `/admin/loans/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Loans", id }],
    }),
    approveLoan: build.mutation<LoanDetailsResponse, ApproveLoanInput>({
      query: ({ id, approvedAmount }) => ({ url: `/admin/loans/${id}/approve`, method: "PATCH", body: { approvedAmount } }),
      invalidatesTags: (_result, error, { id }) => error ? [] : invalidateLoanLists(id),
    }),
    rejectLoan: build.mutation<LoanDetailsResponse, RejectLoanInput>({
      query: ({ id, rejectionReason }) => ({ url: `/admin/loans/${id}/reject`, method: "PATCH", body: { rejectionReason } }),
      invalidatesTags: (_result, error, { id }) => error ? [] : invalidateLoanLists(id),
    }),
    disburseLoan: build.mutation<DisburseLoanResponse, { id: string }>({
      query: ({ id }) => ({ url: `/admin/loans/${id}/disburse`, method: "POST" }),
      invalidatesTags: (_result, error, { id }) => error ? [] : [
        ...invalidateLoanLists(id),
        { type: "BankAccounts", id: "MINE" },
        { type: "BankAccounts", id: "LIST" },
        { type: "Transactions", id: "MY_LIST" },
        { type: "Transactions", id: "ADMIN_LIST" },
      ],
    }),
    getAdminLoanRepayments: build.query<LoanRepaymentHistoryResponse, LoanRepaymentHistoryQuery>({
      query: ({ id, ...params }) => ({ url: `/admin/loans/${id}/repayments`, params }),
      providesTags: (result, _error, { id }) => [
        { type: "LoanRepayments", id: `ADMIN:${id}` },
        ...(result?.data.repayments.map((repayment) => ({ type: "LoanRepayments" as const, id: repayment.id })) ?? []),
      ],
    }),
  }),
});

export const {
  useCreateLoanApplicationMutation,
  useGetMyLoansQuery,
  useGetMyLoanSummaryQuery,
  useGetMyLoanByIdQuery,
  useGetMyLoanRepaymentsQuery,
  useCreateLoanRepaymentMutation,
  useGetStaffLoansQuery,
  useGetStaffLoanByIdQuery,
  useForwardLoanToAdminMutation,
  useGetAdminLoansQuery,
  useGetAdminLoanByIdQuery,
  useApproveLoanMutation,
  useRejectLoanMutation,
  useDisburseLoanMutation,
  useGetAdminLoanRepaymentsQuery,
} = loansApi;
