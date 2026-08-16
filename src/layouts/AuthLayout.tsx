import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans antialiased">
      {/* Brand Header */}
      <header className="flex items-center justify-between max-w-5xl mx-auto w-full py-2">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:border-emerald-400 transition-colors shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-wider text-slate-100 flex items-center gap-1">
              CHECK<span className="text-emerald-500">SCROW</span>
            </span>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold -mt-1">
              Escrow Marketplace
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
          <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[11px]">256-Bit Escrow Security</span>
        </div>
      </header>

      {/* Main Outlet */}
      <main className="w-full max-w-md mx-auto my-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full text-center text-xs text-slate-500 border-t border-slate-900 pt-4">
        <p>© {new Date().getFullYear()} CHECKSCROW Marketplace. Safe Escrow Transactions in Nigeria (₦).</p>
      </footer>
    </div>
  );
};
