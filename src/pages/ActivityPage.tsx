import React, { useState } from 'react';
import { useActivity } from '../hooks/useActivity';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Activity,
  Bell,
  Shield,
  Lock,
  Wallet,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
  UserCheck,
} from 'lucide-react';

export const ActivityPage: React.FC = () => {
  const {
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
    markAsRead,
    markAllAsRead,
  } = useActivity();

  const [activeTab, setActiveTab] = useState<'logs' | 'notifications'>('logs');

  const categories = [
    { id: '', label: 'All Categories' },
    { id: 'wallet', label: 'Wallet & Deposits' },
    { id: 'escrow', label: 'Escrow Lifecycle' },
    { id: 'security', label: 'Security & Password' },
    { id: 'kyc', label: 'KYC & Verification' },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'wallet':
        return <Wallet className="w-4 h-4 text-emerald-400" />;
      case 'escrow':
        return <Lock className="w-4 h-4 text-amber-400" />;
      case 'kyc':
        return <UserCheck className="w-4 h-4 text-sky-400" />;
      case 'security':
      default:
        return <Shield className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-400" />
            <span>Activity & Security Audit Logs</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time audit log of security events, wallet operations, and escrow state transitions.
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit & Security Logs
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'notifications'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-500 text-slate-950 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'notifications' && unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All Read</span>
          </button>
        )}
      </div>

      {/* Tab Content: Logs */}
      {activeTab === 'logs' ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Filter:</span>
            </span>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setLogCategory(cat.id);
                  setLogPage(1);
                }}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                  logCategory === cat.id
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading audit log records...</div>
          ) : activities.length === 0 ? (
            <EmptyState
              icon={<Shield className="w-6 h-6 text-slate-500" />}
              title="No Activity Logs Found"
              description="Your audit log events will be listed here chronologically as you perform actions."
            />
          ) : (
            <div className="space-y-2">
              {activities.map((act) => (
                <Card key={act.id} variant="default" padding="sm" className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                      {getCategoryIcon(act.category)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-100">{act.title}</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">{act.description}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-mono text-slate-500 block">
                      {new Date(act.timestamp).toLocaleString()}
                    </span>
                    {act.ipAddress && (
                      <span className="text-[10px] text-slate-600 font-mono">IP: {act.ipAddress}</span>
                    )}
                  </div>
                </Card>
              ))}

              {/* Log Pagination */}
              {totalLogPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800/60 text-xs">
                  <span className="text-slate-500 font-mono text-[11px]">
                    Page {logPage} of {totalLogPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={logPage <= 1}
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={logPage >= totalLogPages}
                      onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Tab Content: Notifications */
        <div className="space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="w-6 h-6 text-slate-500" />}
              title="No Notifications"
              description="You are caught up with all CHECKSCROW system and escrow updates."
            />
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <Card
                  key={n.id}
                  variant="default"
                  padding="sm"
                  className={`flex items-start justify-between gap-3 text-xs border transition-colors ${
                    !n.isRead ? 'bg-emerald-950/20 border-emerald-800/40' : 'border-slate-800/80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                      {getCategoryIcon(n.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-100">{n.title}</h4>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        )}
                      </div>
                      <p className="text-slate-300 mt-1 text-[11px] leading-relaxed">{n.message}</p>
                      <span className="text-[10px] font-mono text-slate-500 mt-1.5 block">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {!n.isRead && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 shrink-0 cursor-pointer transition-colors"
                      title="Mark as Read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </Card>
              ))}

              {/* Notification Pagination */}
              {totalNotifPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800/60 text-xs">
                  <span className="text-slate-500 font-mono text-[11px]">
                    Page {notifPage} of {totalNotifPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={notifPage <= 1}
                      onClick={() => setNotifPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={notifPage >= totalNotifPages}
                      onClick={() => setNotifPage((p) => Math.min(totalNotifPages, p + 1))}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
