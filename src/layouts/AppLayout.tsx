import React from 'react';
import { Outlet } from 'react-router-dom';
import { DesktopHeader } from '../components/navigation/DesktopHeader';
import { MobileNav } from '../components/navigation/MobileNav';

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Header for Tablet and Desktop */}
      <DesktopHeader />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
};
