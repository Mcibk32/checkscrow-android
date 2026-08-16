import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Wallet, Lock, Shield, ExternalLink } from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import { NotificationItem } from '../../types';

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadAndNotifications = async () => {
    try {
      const [unreadRes, notifRes] = await Promise.all([
        notificationService.getUnreadCount(),
        notificationService.getNotifications(1, 5),
      ]);

      if (unreadRes && typeof (unreadRes as any).count === 'number') {
        setUnreadCount((unreadRes as any).count);
      }

      if (notifRes && notifRes.data) {
        setNotifications(notifRes.data);
      }
    } catch (err) {
      console.error('Error fetching notification bell data:', err);
    }
  };

  useEffect(() => {
    fetchUnreadAndNotifications();
    const interval = setInterval(fetchUnreadAndNotifications, 15000); // 15s polling
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    if (!isOpen) {
      setIsLoading(true);
      fetchUnreadAndNotifications().finally(() => setIsLoading(false));
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'wallet':
        return <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'escrow':
        return <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'kyc':
      case 'security':
      case 'account':
        return <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="relative p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold font-mono bg-emerald-500 text-slate-950 rounded-full min-w-[18px] text-center shadow-lg animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0F1117] border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
          {/* Dropdown Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950 border border-emerald-800/80 text-emerald-400">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
            {isLoading ? (
              <div className="py-8 text-center text-slate-500">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-500 px-4">
                <p className="font-medium">No notifications yet</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  You are caught up with all wallet and escrow updates.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={(e) => !n.isRead && handleMarkAsRead(n.id, e)}
                  className={`p-3 transition-colors flex items-start justify-between gap-2.5 cursor-pointer ${
                    !n.isRead ? 'bg-emerald-950/20 hover:bg-emerald-950/30' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                      {getNotificationIcon(n.type)}
                    </div>
                    <div>
                      <h4 className={`font-semibold ${!n.isRead ? 'text-slate-100' : 'text-slate-300'}`}>
                        {n.title}
                      </h4>
                      <p className="text-slate-400 text-[11px] mt-0.5 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {!n.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(n.id, e)}
                      title="Mark as read"
                      className="p-1 rounded text-slate-500 hover:text-emerald-400 hover:bg-slate-800 shrink-0 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-950/80 text-center">
            <Link
              to="/activity"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <span>View Activity & All Notifications</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
