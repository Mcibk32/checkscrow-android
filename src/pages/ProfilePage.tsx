import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { ProfileCard } from '../components/profile/ProfileCard';
import { BankAccountsCard } from '../components/profile/BankAccountsCard';
import { SecuritySettings } from '../components/profile/SecuritySettings';
import { User, LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1E293B]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-500" />
            <span>Profile & Account Settings</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your personal details, saved bank accounts, KYC status, and security preferences.
          </p>
        </div>

        <Button
          variant="danger"
          size="sm"
          onClick={() => logout()}
          leftIcon={<LogOut className="w-4 h-4" />}
        >
          Sign Out
        </Button>
      </div>

      {/* Profile, Bank Accounts & Security Components */}
      <ProfileCard user={user} />
      <BankAccountsCard />
      <SecuritySettings />
    </div>
  );
};
