import { baseApi } from "@/store/api";

export type NotificationType = "MONEY_RECEIVED" | "TRANSFER_COMPLETED" | "DEPOSIT_APPROVED" | "WITHDRAWAL_REJECTED" | "LOAN_APPROVED" | "LOAN_REJECTED";
export type CustomerNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  relatedEntityType: "transaction" | "deposit" | "withdrawal" | "loan" | null;
  relatedEntityId: string | null;
  createdAt: string;
};
export type NotificationListArgs = { page: number; limit: number; status: "all" | "read" | "unread" };
export type NotificationListResponse = {
  status: "success";
  data: { notifications: CustomerNotification[]; page: number; limit: number; total: number; totalPages: number; unreadCount: number };
};

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    notifications: build.query<NotificationListResponse, NotificationListArgs>({
      query: ({ page, limit, status }) => `/notifications?page=${page}&limit=${limit}&status=${status}`,
      providesTags: ["Notifications"],
      keepUnusedDataFor: 30,
    }),
    markNotificationRead: build.mutation<{ status: "success" }, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "PATCH" }),
      invalidatesTags: ["Notifications"],
    }),
    markAllNotificationsRead: build.mutation<{ status: "success" }, void>({
      query: () => ({ url: "/notifications/read-all", method: "PATCH" }),
      invalidatesTags: ["Notifications"],
    }),
  }),
});

export const { useNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } = notificationsApi;
