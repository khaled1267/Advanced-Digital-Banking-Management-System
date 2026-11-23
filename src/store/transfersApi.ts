import { baseApi } from "@/store/api";

export type TransferDirection = "SENT" | "RECEIVED";
export type TransferRecord = {
  id: string;
  transactionId: string;
  transactionType: "TRANSFER";
  direction: TransferDirection;
  fromAccount: { id: string; maskedAccountNumber: string } | null;
  toAccount: { id: string; maskedAccountNumber: string } | null;
  amount: string;
  currency: "BDT";
  status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type TransfersQuery = {
  search?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
};

type TransferHistoryResponse = {
  status: "success";
  data: {
    transfers: TransferRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: { total: number; completed: number; pending: number; failed: number };
  };
};
type TransferResponse = {
  status: "success";
  data: { transfer: TransferRecord; replayed?: boolean };
};
export type CreateTransferRequest = {
  fromAccountId: string;
  recipientAccountNumber: string;
  amount: string;
  description?: string;
  transactionPin: string;
  idempotencyKey: string;
};

export const transfersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createTransfer: build.mutation<TransferResponse, CreateTransferRequest>({
      query: (body) => ({ url: "/transfers", method: "POST", body }),
      invalidatesTags: (result) => result ? [
        { type: "BankAccounts", id: "MINE" },
        { type: "BankAccounts", id: result.data.transfer.fromAccount?.id ?? "MINE" },
        { type: "BankAccounts", id: result.data.transfer.toAccount?.id ?? "MINE" },
        { type: "Transactions", id: "MY_LIST" },
        { type: "Transfers", id: "MY_LIST" },
      ] : [],
    }),
    getMyTransfers: build.query<TransferHistoryResponse, TransfersQuery>({
      query: (params) => ({ url: "/transfers", params }),
      providesTags: (result) => [
        { type: "Transfers", id: "MY_LIST" },
        ...(result?.data.transfers.map((transfer) => ({ type: "Transfers" as const, id: transfer.id })) ?? []),
      ],
    }),
    getMyTransferById: build.query<TransferResponse, string>({
      query: (id) => `/transfers/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Transfers", id }],
    }),
  }),
});

export const {
  useCreateTransferMutation,
  useGetMyTransfersQuery,
  useGetMyTransferByIdQuery,
} = transfersApi;
