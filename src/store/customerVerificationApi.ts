import { baseApi } from "@/store/api";

export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type CustomerVerificationRecord = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  profileImageUrl: string | null;
  createdAt: string;
  updatedAt?: string;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  verificationNote: string | null;
  verifiedBy?: { id: string; name: string; email: string; role: "STAFF" | "ADMIN" } | null;
};

export type CustomerVerificationQuery = {
  search?: string;
  verificationStatus?: VerificationStatus | "";
  page: number;
  limit: number;
};

type CustomerVerificationListResponse = {
  status: "success";
  data: { customers: CustomerVerificationRecord[]; total: number; page: number; totalPages: number; limit: number };
};
type CustomerVerificationResponse = { status: "success"; data: { customer: CustomerVerificationRecord } };
type VerificationDecision =
  | { verificationStatus: "VERIFIED" }
  | { verificationStatus: "REJECTED"; verificationNote: string };
type VerificationUpdateInput = { id: string; decision: VerificationDecision };

export const customerVerificationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCustomersForVerification: build.query<CustomerVerificationListResponse, CustomerVerificationQuery>({
      query: ({ verificationStatus, ...params }) => ({
        url: "/staff/customers",
        params: { ...params, ...(verificationStatus ? { verificationStatus } : {}) },
      }),
      providesTags: (result) => [
        { type: "CustomerVerification", id: "LIST" },
        ...(result?.data.customers.map((customer) => ({ type: "CustomerVerification" as const, id: customer.id })) ?? []),
      ],
    }),
    getCustomerVerificationDetails: build.query<CustomerVerificationResponse, string>({
      query: (id) => `/staff/customers/${id}`,
      providesTags: (_result, _error, id) => [{ type: "CustomerVerification", id }],
    }),
    decideCustomerVerification: build.mutation<CustomerVerificationResponse, VerificationUpdateInput>({
      query: ({ id, decision }) => ({ url: `/staff/customers/${id}/verification`, method: "PATCH", body: decision }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "CustomerVerification", id },
        { type: "CustomerVerification", id: "LIST" },
        "AdminUsers",
        "Auth",
      ],
    }),
  }),
});

export const {
  useGetCustomersForVerificationQuery,
  useGetCustomerVerificationDetailsQuery,
  useDecideCustomerVerificationMutation,
} = customerVerificationApi;
