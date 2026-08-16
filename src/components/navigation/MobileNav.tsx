import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Lock, Wallet, Activity, User, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const MobileNav: React.FC = () => {
  const { user } = useAuth();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Escrow', path: '/escrow', icon: Lock },
    { label: 'Wallet', path: '/wallet', icon: Wallet },
    { label: 'Activity', path: '/activity', icon: Activity },
    { label: 'Profile', path: '/profile', icon: User },
  ];

  if (user?.role === 'admin' || user?.role === 'moderator') {
    navItems.splice(4, 0, { label: 'Admin', path: '/admin', icon: ShieldAlert });
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F17]/95 backdrop-blur-lg border-t border-slate-800/90 px-2 py-1 shadow-2xl">
      <nav className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] px-1 transition-colors ${
                  isActive
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-lg ${isActive ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight font-medium">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
