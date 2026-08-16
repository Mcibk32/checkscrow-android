import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../../hooks/useAuth';

export const DesktopHeader: React.FC = () => {
  const { kycBadge } = useAuth();
  const location = useLocation();

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/dashboard':
        return 'Dashboard Overview';
      case '/escrow':
        return 'Escrow Transactions';
      case '/wallet':
        return 'Naira Wallet';
      case '/kyc':
        return 'KYC Identity Verification';
      case '/activity':
        return 'Activity & Audit Log';
      case '/profile':
        return 'Account & KYC Settings';
      default:
        return 'CHECKSCROW';
    }
  };

  const getBadgeStyles = (variant: string) => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300';
      case 'warning':
        return 'bg-amber-950/60 border-amber-800/60 text-amber-300';
      case 'danger':
        return 'bg-rose-950/60 border-rose-800/60 text-rose-300';
      default:
        return 'bg-slate-900 border-slate-800 text-slate-400';
    }
  };

  const getDotStyles = (variant: string) => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-400';
      case 'warning':
        return 'bg-amber-400';
      case 'danger':
        return 'bg-rose-400';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <header className="h-16 border-b border-[#1E293B] bg-[#0B0C10] flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0">
      {/* Page Title & Mobile Brand */}
      <div className="flex items-center gap-3">
        {/* Mobile Logo toggle */}
        <Link to="/dashboard" className="flex md:hidden items-center gap-2">
          <div className="w-6 h-6 bg-emerald-500 rounded-sm flex items-center justify-center font-bold text-slate-950 text-xs">
            C
          </div>
          <span className="font-bold text-white text-sm font-mono">CHECKSCROW</span>
        </Link>

        <h1 className="hidden md:block text-base font-semibold text-white tracking-tight">
          {getPageTitle(location.pathname)}
        </h1>
      </div>

      {/* Right Controls: KYC Status Badge, Notification Bell & User Menu */}
      <div className="flex items-center gap-3">
        <Link
          to="/kyc"
          className={`border px-3 py-1 rounded-lg flex items-center gap-2 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer ${getBadgeStyles(kycBadge.variant)}`}
        >
          <div className={`w-2 h-2 rounded-full ${getDotStyles(kycBadge.variant)} ${kycBadge.isVerified ? 'animate-pulse' : ''}`}></div>
          <span>KYC: {kycBadge.label.toUpperCase()}</span>
        </Link>

        <NotificationBell />

        <UserMenu />
      </div>
    </header>
  );
};
