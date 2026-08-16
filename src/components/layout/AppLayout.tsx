import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DesktopHeader } from '../navigation/DesktopHeader';
import { MobileNav } from '../navigation/MobileNav';
import { LayoutDashboard, Lock, Wallet, Activity, User, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, isGuestExplorer } = useAuth();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Escrow', path: '/escrow', icon: Lock },
    { label: 'Wallet', path: '/wallet', icon: Wallet },
    { label: 'KYC Verification', path: '/kyc', icon: ShieldCheck },
    { label: 'Activity', path: '/activity', icon: Activity },
  ];

  if (user?.role === 'admin' || user?.role === 'moderator') {
    navItems.push({ label: 'Admin Center', path: '/admin', icon: ShieldAlert });
  }

  return (
    <div className="flex h-screen w-full bg-[#0B0C10] text-[#E2E8F0] font-sans overflow-hidden">
      {/* Desktop Sidebar Navigation matching Professional Polish Theme */}
      <aside className="hidden md:flex w-64 bg-[#111318] border-r border-[#1E293B] flex-col shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-emerald-500 rounded-sm flex items-center justify-center font-bold text-slate-950 text-xs">
              C
            </div>
            <span className="text-xl font-bold tracking-tight text-white font-mono">CHECKSCROW</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
            Naira Escrow Platform
          </p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#1E293B] text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-[#1E293B]/50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile Footer in Sidebar */}
        <div className="p-4 border-t border-[#1E293B]">
          <NavLink
            to="/profile"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
              location.pathname === '/profile'
                ? 'bg-[#1E293B] text-emerald-400'
                : 'text-slate-400 hover:text-white hover:bg-[#1E293B]/50'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#1E293B] flex items-center justify-center text-xs font-bold text-emerald-400 border border-[#334155] shrink-0">
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'G'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {user?.fullName || (isGuestExplorer ? 'Guest Explorer' : 'Account')}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span className="capitalize">{user?.kycStatus || 'Tier 1'}</span>
              </div>
            </div>
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0B0C10] overflow-hidden">
        <DesktopHeader />

        {/* Scrollable Main Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20 md:pb-8">
          {children}
        </main>

        <MobileNav />
      </div>
    </div>
  );
};
