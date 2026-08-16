import { api } from './api';
import { ApiResponse, NotificationItem, ActivityLog, WalletTransaction } from '../types';

export const notificationService = {
  async getNotifications(page = 1, limit = 20): Promise<ApiResponse<NotificationItem[]>> {
    return api.get<NotificationItem[]>(`/notifications?page=${page}&limit=${limit}`);
  },

  async getUnreadCount(): Promise<ApiResponse<{ count: number }> | { success: boolean; count: number }> {
    return api.get<{ count: number }>('/notifications/unread-count');
  },

  async markAsRead(id: string): Promise<ApiResponse<void>> {
    return api.put<void>(`/notifications/${id}/read`);
  },

  async markAllAsRead(): Promise<ApiResponse<void>> {
    return api.put<void>('/notifications/read-all');
  },

  async getActivityLogs(page = 1, limit = 20, category?: string): Promise<ApiResponse<ActivityLog[]>> {
    let url = `/activity/logs?page=${page}&limit=${limit}`;
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }
    return api.get<ActivityLog[]>(url);
  },

  async getUnifiedTransactions(page = 1, limit = 20, type?: string): Promise<ApiResponse<WalletTransaction[]>> {
    let url = `/transactions?page=${page}&limit=${limit}`;
    if (type) {
      url += `&type=${encodeURIComponent(type)}`;
    }
    return api.get<WalletTransaction[]>(url);
  },
};
