import { baseApi } from "@/store/api";
import type { UserRegistrationInput, UserLoginInput } from "@/lib/validation/user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | "CUSTOMER";
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
  profileImageUrl?: string | null;
};

export type CustomerProfile = Pick<AuthUser, "id" | "name" | "email" | "role" | "status" | "createdAt" | "profileImageUrl">;
export type CustomerProfileAccount = {
  id: string;
  maskedAccountNumber: string;
  accountType: "SAVINGS" | "CURRENT";
  status: "ACTIVE" | "INACTIVE" | "FROZEN" | "CLOSED";
  createdAt: string;
};

type UpdateProfileResponse = { status: "success"; data: { profile: CustomerProfile } };
type CustomerProfileResponse = {
  status: "success";
  data: { profile: CustomerProfile; accounts: CustomerProfileAccount[]; cloudinaryConfigured: boolean };
};
type AvatarUploadSignatureResponse = {
  status: "success";
  data: { allowed_formats: string; apiKey: string; cloudName: string; overwrite: string; public_id: string; timestamp: number; signature: string };
};
type AvatarMutationResponse = { status: "success"; data: { profile: CustomerProfile; cleanupPending: boolean } };

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
    customerProfile: build.query<CustomerProfileResponse, void>({
      query: () => "/profile",
      providesTags: ["Auth"],
    }),
    updateCustomerProfile: build.mutation<UpdateProfileResponse, { name: string }>({
      query: (body) => ({ url: "/profile", method: "PATCH", body }),
      invalidatesTags: ["Auth"],
    }),
    createAvatarUploadSignature: build.mutation<AvatarUploadSignatureResponse, void>({
      query: () => ({ url: "/profile/avatar/signature", method: "POST" }),
    }),
    finalizeAvatarUpload: build.mutation<AvatarMutationResponse, { publicId: string }>({
      query: (body) => ({ url: "/profile/avatar", method: "POST", body }),
      invalidatesTags: ["Auth"],
    }),
    removeAvatar: build.mutation<AvatarMutationResponse, void>({
      query: () => ({ url: "/profile/avatar", method: "DELETE" }),
      invalidatesTags: ["Auth"],
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
  useCustomerProfileQuery,
  useUpdateCustomerProfileMutation,
  useCreateAvatarUploadSignatureMutation,
  useFinalizeAvatarUploadMutation,
  useRemoveAvatarMutation,
  useLogoutMutation,
} = authApi;
