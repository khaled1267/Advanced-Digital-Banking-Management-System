import { baseApi } from "@/store/api";

export type RegisterStaffCustomerInput = { name: string; email: string; password: string };
export type RegisteredStaffCustomer = { id: string; name: string; email: string; role: "CUSTOMER"; status: "ACTIVE"; createdAt: string };
type RegisterStaffCustomerResponse = { status: "success"; data: { customer: RegisteredStaffCustomer } };

export const staffCustomersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    registerStaffCustomer: build.mutation<RegisterStaffCustomerResponse, RegisterStaffCustomerInput>({
      query: (body) => ({ url: "/staff/customers", method: "POST", body }),
      invalidatesTags: ["AdminUsers", "BankAccounts"],
    }),
  }),
});

export const { useRegisterStaffCustomerMutation } = staffCustomersApi;
