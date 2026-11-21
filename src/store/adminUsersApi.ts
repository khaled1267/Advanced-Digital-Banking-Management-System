import { baseApi } from "@/store/api";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | "CUSTOMER";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type AdminUsersQuery = {
  search?: string;
  role?: "ADMIN" | "STAFF" | "CUSTOMER";
  status?: "ACTIVE" | "INACTIVE";
  page: number;
  limit: number;
};

type AdminUsersResponse = {
  status: "success";
  data: {
    users: ManagedUser[];
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
};

type AdminUserResponse = {
  status: "success";
  data: { user: ManagedUser };
};

export type CreateAdminUserInput = {
  name: string;
  email: string;
  password: string;
  role: "STAFF" | "CUSTOMER";
};

export type UpdateAdminUserInput = {
  id: string;
  name?: string;
  role?: "STAFF" | "CUSTOMER";
  status?: "ACTIVE" | "INACTIVE";
};

export const adminUsersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminUsers: build.query<AdminUsersResponse, AdminUsersQuery>({
      query: (params) => ({ url: "/admin/users", params }),
      providesTags: (result) => [
        { type: "AdminUsers", id: "LIST" },
        ...(result?.data.users.map((user) => ({ type: "AdminUsers" as const, id: user.id })) ?? []),
      ],
    }),
    getAdminUserById: build.query<AdminUserResponse, string>({
      query: (id) => `/admin/users/${id}`,
      providesTags: (_result, _error, id) => [{ type: "AdminUsers", id }],
    }),
    createAdminUser: build.mutation<AdminUserResponse, CreateAdminUserInput>({
      query: (body) => ({ url: "/admin/users", method: "POST", body }),
      invalidatesTags: [{ type: "AdminUsers", id: "LIST" }],
    }),
    updateAdminUser: build.mutation<AdminUserResponse, UpdateAdminUserInput>({
      query: ({ id, ...body }) => ({ url: `/admin/users/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "AdminUsers", id },
        { type: "AdminUsers", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetAdminUsersQuery,
  useGetAdminUserByIdQuery,
  useCreateAdminUserMutation,
  useUpdateAdminUserMutation,
} = adminUsersApi;
