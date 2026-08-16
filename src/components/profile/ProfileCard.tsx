import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { KYCStatusBadge } from './KYCStatusBadge';
import { kycService } from '../../services/kycService';
import { profileService } from '../../services/profileService';
import { useAuth } from '../../hooks/useAuth';
import { User, Phone, ShieldCheck, FileCheck, Save, CheckCircle2 } from 'lucide-react';

export interface ProfileCardProps {
  user: UserProfile | null;
  onProfileUpdated?: () => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ user, onProfileUpdated }) => {
  const { refetchUser, isGuestExplorer } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingKyc, setIsSubmittingKyc] = useState(false);
  const [kycMessage, setKycMessage] = useState<string | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await profileService.updateProfile({ fullName, phoneNumber });
    await refetchUser();
    setIsSaving(false);
    if (onProfileUpdated) onProfileUpdated();
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bvn.length !== 11 && nin.length !== 11) {
      setKycMessage('Please provide a valid 11-digit BVN or NIN.');
      return;
    }
    setIsSubmittingKyc(true);
    setKycMessage(null);
    const res = await kycService.submitVerification({ bvn, nin });
    await refetchUser();
    setIsSubmittingKyc(false);
    if (res.success) {
      setKycMessage('KYC Verification submitted successfully. Documents under automated NIBSS verification.');
      if (onProfileUpdated) onProfileUpdated();
    } else {
      setKycMessage('KYC submitted. Pending review.');
    }
  };

  return (
    <div className="space-y-4">
      {/* User Information */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-bold text-lg shrink-0">
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'G'}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {user?.fullName || (isGuestExplorer ? 'Guest Explorer' : 'CHECKSCROW User')}
              </h3>
              <p className="text-xs text-slate-400">
                {user?.email || (isGuestExplorer ? 'Guest Explorer Mode' : 'user@checkscrow.ng')}
              </p>
            </div>
          </div>

          <div>
            <KYCStatusBadge status={user?.kycStatus || (isGuestExplorer ? 'unverified' : 'unverified')} tier={user?.kycTier || 1} />
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Legal Name"
              leftIcon={<User className="w-4 h-4" />}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Babatunde Olawale"
            />
            <Input
              label="Phone Number"
              leftIcon={<Phone className="w-4 h-4" />}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 08012345678"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              isLoading={isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Card>

      {/* KYC Verification Form */}
      <Card variant="default" padding="lg" className="border-emerald-900/30">
        <div className="flex items-center gap-2 mb-3">
          <FileCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100">Identity & KYC Verification (CBN / NIBSS Standard)</h3>
        </div>

        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Verify your identity with your Bank Verification Number (BVN) or National Identity Number (NIN) to unlock higher daily escrow transaction limits.
        </p>

        {kycMessage && (
          <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-xs text-emerald-300 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{kycMessage}</span>
          </div>
        )}

        <form onSubmit={handleKycSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Bank Verification Number (BVN)"
              placeholder="11-digit BVN"
              maxLength={11}
              value={bvn}
              onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
              helperText="Encrypted via NIBSS API. Used solely for identity match."
            />

            <Input
              label="National Identity Number (NIN)"
              placeholder="11-digit NIN"
              maxLength={11}
              value={nin}
              onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
              helperText="Official NIMC database verification."
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmittingKyc}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Submit for Verification
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
