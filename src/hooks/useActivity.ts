import { useState, useEffect, useCallback } from 'react';
import { ActivityLog, NotificationItem } from '../types';
import { notificationService } from '../services/notificationService';

export const useActivity = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [logCategory, setLogCategory] = useState<string>('');
  const [logPage, setLogPage] = useState<number>(1);
  const [totalLogPages, setTotalLogPages] = useState<number>(1);
  const [notifPage, setNotifPage] = useState<number>(1);
  const [totalNotifPages, setTotalNotifPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [actRes, notifRes, unreadRes] = await Promise.all([
        notificationService.getActivityLogs(logPage, 20, logCategory || undefined),
        notificationService.getNotifications(notifPage, 20),
        notificationService.getUnreadCount(),
      ]);

      if (actRes && actRes.data) {
        setActivities(actRes.data);
        if (actRes.pagination) {
          setTotalLogPages(actRes.pagination.totalPages || 1);
        }
      } else {
        setActivities([]);
      }

      if (notifRes && notifRes.data) {
        setNotifications(notifRes.data);
        if (notifRes.pagination) {
          setTotalNotifPages(notifRes.pagination.totalPages || 1);
        }
      } else {
        setNotifications([]);
      }

      if (unreadRes) {
        setUnreadCount((unreadRes as any).count || 0);
      }
    } catch {
      setError('Failed to fetch activity records.');
      setActivities([]);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [logPage, logCategory, notifPage]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const markAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  return {
    activities,
    notifications,
    unreadCount,
    logCategory,
    setLogCategory,
    logPage,
    setLogPage,
    totalLogPages,
    notifPage,
    setNotifPage,
    totalNotifPages,
    isLoading,
    error,
    refetch: fetchActivity,
    markAsRead,
    markAllAsRead,
  };
};
