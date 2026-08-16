import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { profileService } from '../../services/profileService';
import { Shield, Lock, KeyRound, CheckCircle2 } from 'lucide-react';

export const SecuritySettings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enable2FA, setEnable2FA] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);

    const res = await profileService.updateSecuritySettings({
      currentPassword,
      newPassword,
      enable2FA,
    });

    setIsLoading(false);

    if (res.success) {
      setMessage('Security credentials updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError(res.error || 'Failed to update security credentials.');
    }
  };

  return (
    <Card variant="default" padding="lg" id="security">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
        <Shield className="w-5 h-5 text-emerald-400" />
        <h3 className="text-sm font-bold text-slate-100">Security & Authentication Settings</h3>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-xs text-emerald-300 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-400 font-medium bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50 mb-4">
          {error}
        </p>
      )}

      <form onSubmit={handleChangePassword} className="space-y-4">
        <Input
          label="Current Password"
          type="password"
          leftIcon={<Lock className="w-4 h-4" />}
          placeholder="••••••••"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="New Password"
            type="password"
            leftIcon={<KeyRound className="w-4 h-4" />}
            placeholder="Min 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <Input
            label="Confirm New Password"
            type="password"
            leftIcon={<KeyRound className="w-4 h-4" />}
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {/* 2FA Toggle */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-200 block">Two-Factor Authentication (2FA)</span>
            <span className="text-[11px] text-slate-400">Require SMS or Authenticator code on high-value escrow releases</span>
          </div>
          <button
            type="button"
            onClick={() => setEnable2FA(!enable2FA)}
            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              enable2FA ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
            }`}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-md" />
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            Update Security Settings
          </Button>
        </div>
      </form>
    </Card>
  );
};
