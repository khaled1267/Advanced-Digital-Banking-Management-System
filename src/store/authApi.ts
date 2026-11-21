import { baseApi } from "@/store/api";
import type { UserRegistrationInput, UserLoginInput } from "@/lib/validation/user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | "CUSTOMER";
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
};

type AuthUserResponse = {
  status: "success";
  data: { user: AuthUser };
};

type LogoutResponse = {
  success: true;
  message: string;
};

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation<AuthUserResponse, UserRegistrationInput>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
    }),
    login: build.mutation<AuthUserResponse, UserLoginInput>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    currentUser: build.query<AuthUserResponse, void>({
      query: () => "/auth/me",
      providesTags: ["Auth"],
    }),
    logout: build.mutation<LogoutResponse, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useCurrentUserQuery,
  useLogoutMutation,
} = authApi;
