import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { kycService } from '../services/kycService';
import { 
  ShieldCheck, 
  FileCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Building2, 
  Lock, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export const KycPage: React.FC = () => {
  const { user, kycBadge, refetchUser, isGuestExplorer } = useAuth();
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const kycStatus = user?.kycStatus || 'unverified';
  const kycTier = user?.kycTier || 1;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await kycService.getKYCStatus();
        if (res.success && res.data) {
          if (res.data.rejectionReason) {
            setRejectionReason(res.data.rejectionReason);
          }
        }
      } catch (err) {
        console.error('Failed to fetch KYC status:', err);
      }
    };
    fetchStatus();
  }, []);

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuestExplorer) {
      setError('Please log in or register an account to submit KYC verification.');
      return;
    }

    const cleanBvn = bvn.replace(/\D/g, '');
    const cleanNin = nin.replace(/\D/g, '');

    if (!cleanBvn && !cleanNin) {
      setError('Please provide a valid 11-digit BVN or NIN.');
      return;
    }

    if (cleanBvn && cleanBvn.length !== 11) {
      setError('BVN must be exactly 11 digits.');
      return;
    }

    if (cleanNin && cleanNin.length !== 11) {
      setError('NIN must be exactly 11 digits.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const res = await kycService.submitVerification({ bvn: cleanBvn, nin: cleanNin });
    await refetchUser();
    setIsSubmitting(false);

    if (res.success) {
      setMessage('KYC details submitted successfully. Verification is currently under automated NIBSS review.');
      setBvn('');
      setNin('');
    } else {
      setError(res.error || 'Failed to submit KYC verification.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1E293B]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>KYC Verification & Transaction Limits</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Compliance verification under CBN & NIBSS standards for safe escrow transfers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            kycStatus === 'verified'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : kycStatus === 'pending'
              ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
              : kycStatus === 'rejected'
              ? 'bg-rose-950/60 border-rose-800/60 text-rose-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              kycStatus === 'verified' ? 'bg-emerald-400 animate-pulse' :
              kycStatus === 'pending' ? 'bg-amber-400 animate-pulse' :
              kycStatus === 'rejected' ? 'bg-rose-400' : 'bg-slate-500'
            }`} />
            <span>KYC: {kycBadge.label.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Guest Explorer Warning */}
      {isGuestExplorer && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-900/60 text-amber-300 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-200">Guest Explorer Mode</p>
            <p className="mt-0.5 text-amber-300/80">
              You are currently viewing CHECKSCROW as a Guest. Register an account or log in to submit identity verification and unlock higher transaction limits.
            </p>
          </div>
        </div>
      )}

      {/* Status Notifications */}
      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-xs text-emerald-300 flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tier Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tier 1 Card */}
        <Card variant={kycTier === 1 && kycStatus !== 'verified' ? 'default' : 'subtle'} padding="md" className="border-slate-800 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tier 1</span>
            {kycTier === 1 && kycStatus === 'unverified' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">CURRENT</span>
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-100">Starter Account</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Basic unverified marketplace tier assigned on signup.</p>
          <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Daily Deposit / Transfer:</span>
              <span className="font-semibold text-white">₦50,000.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Max Escrow Deal:</span>
              <span className="font-semibold text-white">₦100,000.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Verification:</span>
              <span className="text-slate-400">None required</span>
            </div>
          </div>
        </Card>

        {/* Tier 2 Card */}
        <Card variant={kycTier === 2 || kycStatus === 'pending' ? 'default' : 'subtle'} padding="md" className="border-emerald-900/50 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Tier 2</span>
            {kycStatus === 'pending' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/50">PENDING REVIEW</span>
            )}
            {kycStatus === 'verified' && kycTier === 2 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/50">VERIFIED</span>
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-100">Standard Escrow User</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Verified individual with automated BVN/NIN match.</p>
          <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Daily Deposit / Transfer:</span>
              <span className="font-semibold text-emerald-400">₦500,000.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Max Escrow Deal:</span>
              <span className="font-semibold text-emerald-400">₦2,000,000.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Requirements:</span>
              <span className="text-slate-200">11-digit BVN or NIN</span>
            </div>
          </div>
        </Card>

        {/* Tier 3 Card */}
        <Card variant="subtle" padding="md" className="border-slate-800 opacity-80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Tier 3</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">INSTITUTIONAL</span>
          </div>
          <h3 className="text-sm font-bold text-slate-100">Merchant / Enterprise</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Uncapped transaction limits for high-volume traders.</p>
          <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Daily Deposit / Transfer:</span>
              <span className="font-semibold text-sky-400">Unlimited</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Max Escrow Deal:</span>
              <span className="font-semibold text-sky-400">Unlimited</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Requirements:</span>
              <span className="text-slate-400">Govt ID + Utility / CAC</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Dynamic KYC Status View & Form */}
      {kycStatus === 'verified' ? (
        <Card variant="default" padding="lg" className="border-emerald-800/60 bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Identity Verification Active (Tier {kycTier})</h3>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Your account is verified against official NIBSS/NIMC database records. Higher escrow limits are active on your account.
              </p>
            </div>
          </div>
        </Card>
      ) : kycStatus === 'pending' ? (
        <Card variant="default" padding="lg" className="border-amber-800/60 bg-amber-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/60 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Verification Submission Under Review</h3>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Your BVN/NIN submission is processing through automated NIBSS database verification. No further action is required at this time.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="default" padding="lg" className="border-slate-800">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
            <FileCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">Submit Identity Verification (Tier 2 Upgrade)</h3>
          </div>

          {kycStatus === 'rejected' && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 mb-4 flex items-start gap-2.5">
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">KYC Verification Rejected</p>
                <p className="mt-0.5 text-rose-300/90">
                  {rejectionReason || 'Previous verification attempt was rejected by moderator or automated database check.'}
                </p>
                <p className="mt-1 text-[11px] text-rose-400/80">
                  Please re-verify your 11-digit BVN or NIN details carefully before resubmitting.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Submit your 11-digit Bank Verification Number (BVN) or National Identity Number (NIN). Your identity details are verified securely against official NIBSS and NIMC records.
          </p>

          <form onSubmit={handleSubmitVerification} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Bank Verification Number (BVN)"
                placeholder="11-digit BVN"
                maxLength={11}
                value={bvn}
                onChange={(e) => {
                  setBvn(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                disabled={isGuestExplorer}
                helperText="Encrypted via NIBSS. Used solely for identity verification."
              />

              <Input
                label="National Identity Number (NIN)"
                placeholder="11-digit NIN"
                maxLength={11}
                value={nin}
                onChange={(e) => {
                  setNin(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                disabled={isGuestExplorer}
                helperText="Official NIMC database identity cross-check."
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                CHECKSCROW never stores full bank account PINs or passwords. Identity numbers are encrypted in transit and hashed in accordance with NDPR data protection guidelines.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSubmitting}
                disabled={isGuestExplorer}
                leftIcon={<ShieldCheck className="w-4 h-4" />}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Submit Verification Request
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};
