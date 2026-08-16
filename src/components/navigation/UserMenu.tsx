import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { User, LogOut, Shield, ChevronDown, CheckCircle2, ShieldAlert } from 'lucide-react';

export const UserMenu: React.FC = () => {
  const { user, logout, displayName, kycBadge, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initial = isAuthenticated && user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'G';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 pl-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors text-xs text-slate-200 cursor-pointer min-h-[40px]"
      >
        <div className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400 font-bold text-[11px]">
          {initial}
        </div>
        <span className="font-medium max-w-[110px] truncate hidden sm:inline">
          {displayName}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0F172A] border border-slate-800 shadow-xl z-50 py-1 divide-y divide-slate-800 text-xs">
          <div className="px-4 py-3">
            <p className="font-semibold text-slate-100 truncate">
              {displayName}
            </p>
            <p className="text-slate-400 truncate text-[11px]">
              {isAuthenticated ? (user?.email || 'Authenticated User') : 'Guest Explorer Session'}
            </p>
            <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded border w-fit ${
              kycBadge.variant === 'success'
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                : kycBadge.variant === 'warning'
                ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
                : kycBadge.variant === 'danger'
                ? 'bg-rose-950/60 border-rose-800/60 text-rose-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}>
              {kycBadge.isVerified ? <CheckCircle2 className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              <span>KYC: {kycBadge.label.toUpperCase()}</span>
            </div>
          </div>

          <div className="py-1">
            <Link
              to="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>Profile & Verification</span>
            </Link>
            <Link
              to="/profile#security"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Shield className="w-4 h-4 text-slate-400" />
              <span>Security Settings</span>
            </Link>
            {(user?.role === 'admin' || user?.role === 'moderator') && (
              <Link
                to="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition-colors"
              >
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Admin Portal</span>
              </Link>
            )}
          </div>

          <div className="py-1">
            <button
              onClick={async () => {
                setIsOpen(false);
                await logout();
              }}
              className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
