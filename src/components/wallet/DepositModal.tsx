import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { walletService } from '../../services/walletService';
import { formatNaira } from '../../utils/formatters';
import {
  Building2,
  CreditCard,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialReference?: string | null;
}

type DepositStep = 'form' | 'initiated' | 'verifying' | 'success' | 'failed';

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialReference,
}) => {
  const [step, setStep] = useState<DepositStep>('form');
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<'bank_transfer' | 'card' | 'ussd'>('bank_transfer');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Payment details received from backend
  const [paymentData, setPaymentData] = useState<{
    reference: string;
    amount: number;
    currency: string;
    checkoutUrl?: string;
    provider?: string;
    providerReference?: string;
    status: string;
    availableBalance?: number;
  } | null>(null);

  // Auto-verify if initialReference is passed (e.g. returning from checkout redirect)
  useEffect(() => {
    if (isOpen && initialReference) {
      setPaymentData({
        reference: initialReference,
        amount: 0,
        currency: 'NGN',
        status: 'pending',
      });
      setStep('verifying');
      handleVerifyReference(initialReference);
    }
  }, [isOpen, initialReference]);

  const handleInitiateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 500) {
      setError('Minimum deposit amount is ₦500.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const res = await walletService.initiateDeposit({
      amount: numAmount,
      paymentMethod: method,
    });

    setIsLoading(false);

    if (res.success && res.data) {
      setPaymentData({
        reference: res.data.reference,
        amount: res.data.amount,
        currency: res.data.currency || 'NGN',
        checkoutUrl: res.data.checkoutUrl,
        provider: res.data.provider,
        providerReference: res.data.providerReference,
        status: res.data.status,
      });
      setStep('initiated');
    } else {
      setError(res.error || 'Failed to initiate deposit. Please check payment provider settings.');
    }
  };

  const handleVerifyReference = async (refToVerify?: string) => {
    const targetRef = refToVerify || paymentData?.reference;
    if (!targetRef) return;

    setIsLoading(true);
    setError(null);
    setStep('verifying');

    const res = await walletService.verifyPayment(targetRef);

    setIsLoading(false);

    if (res.success && res.data && res.data.status === 'successful') {
      setPaymentData((prev) => ({
        ...prev!,
        reference: res.data!.reference,
        amount: res.data!.amount || prev?.amount || 0,
        currency: res.data!.currency || 'NGN',
        status: 'successful',
        availableBalance: res.data!.availableBalance,
      }));
      setStep('success');
      onSuccess();
    } else {
      setError(res.error || 'Payment could not be verified yet. Please ensure funds were transferred and try again.');
      setStep('failed');
    }
  };

  const handleReset = () => {
    setStep('form');
    setAmount('');
    setMethod('bank_transfer');
    setError(null);
    setPaymentData(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleReset}
      title="Deposit Naira (₦)"
      subtitle="Fund your CHECKSCROW wallet securely through verified payment gateways."
    >
      {/* STEP 1: INITIAL DEPOSIT FORM */}
      {step === 'form' && (
        <form onSubmit={handleInitiateDeposit} className="space-y-4">
          <Input
            label="Deposit Amount (₦)"
            type="number"
            prefixSymbol="₦"
            placeholder="e.g. 50000"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            error={error || undefined}
            helperText="Minimum deposit: ₦500. Wallet balance is credited only after verified server-side confirmation."
            required
            autoFocus
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Select Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod('bank_transfer')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                  method === 'bank_transfer'
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-5 h-5" />
                <span className="text-xs">Bank Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                  method === 'card'
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs">Debit Card</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('ussd')}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                  method === 'ussd'
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-5 h-5" />
                <span className="text-xs">USSD Code</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Verified Payment Gateway Protection</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              CHECKSCROW creates an official payment transaction before redirecting. Funds are credited to your wallet strictly after server-to-server payment verification.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Continue to Payment
            </Button>
          </div>
        </form>
      )}

      {/* STEP 2: PAYMENT INITIATED */}
      {step === 'initiated' && paymentData && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                <span>Payment Initiated</span>
              </h4>
              <Badge variant="warning">Pending Verification</Badge>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Your payment reference has been created. Please complete payment with the gateway. Your wallet balance remains unchanged until payment confirmation is verified server-side.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Deposit Amount</span>
              <span className="font-bold text-emerald-400 text-sm">{formatNaira(paymentData.amount)}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Payment Reference</span>
              <span className="font-bold text-slate-200">{paymentData.reference}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Provider Gateway</span>
              <span className="font-sans font-medium text-slate-300 capitalize">{paymentData.provider || 'Paystack'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Wallet Status</span>
              <span className="text-amber-400 font-sans font-medium">Uncredited (Pending Verification)</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {paymentData.checkoutUrl && (
              <a
                href={paymentData.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
              >
                <span>Proceed to Payment Gateway</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <Button
              variant="secondary"
              fullWidth
              isLoading={isLoading}
              onClick={() => handleVerifyReference()}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              I Have Completed Payment — Verify Now
            </Button>

            <Button variant="ghost" fullWidth onClick={handleReset}>
              Cancel / Close
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: VERIFYING STATE */}
      {step === 'verifying' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center mx-auto text-emerald-400 animate-spin">
            <Loader2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-100">Verifying Payment Status...</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Connecting to payment provider to verify reference <span className="font-mono text-emerald-400">{paymentData?.reference}</span>.
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: VERIFICATION SUCCESS */}
      {step === 'success' && paymentData && (
        <div className="space-y-5 text-center py-2">
          <div className="w-14 h-14 rounded-full bg-emerald-950 border border-emerald-500 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h4 className="text-lg font-bold text-emerald-400">Payment Verified & Successful!</h4>
            <p className="text-xs text-slate-300">
              <span className="font-bold text-slate-100">{formatNaira(paymentData.amount)}</span> has been confirmed and credited to your available wallet balance.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-2 text-left">
            <div className="flex justify-between items-center text-slate-400 pb-1.5 border-b border-slate-800">
              <span>Reference</span>
              <span className="text-slate-200">{paymentData.reference}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 pb-1.5 border-b border-slate-800">
              <span>Status</span>
              <Badge variant="success">Successful</Badge>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Wallet Balance</span>
              <span className="text-emerald-400 font-bold">Credited</span>
            </div>
          </div>

          <Button variant="primary" fullWidth onClick={handleReset}>
            Done & View Wallet
          </Button>
        </div>
      )}

      {/* STEP 5: VERIFICATION FAILED */}
      {step === 'failed' && (
        <div className="space-y-4 py-2">
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs space-y-2 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-900/60 border border-rose-700 flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-rose-300">Payment Could Not Be Verified</h4>
            <p className="text-[11px] text-rose-200/90 leading-relaxed">
              {error || 'The payment gateway has not confirmed this transaction yet. Your wallet has NOT been credited.'}
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Button
              variant="primary"
              fullWidth
              isLoading={isLoading}
              onClick={() => handleVerifyReference()}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Retry Verification
            </Button>

            {paymentData?.checkoutUrl && (
              <a
                href={paymentData.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-medium text-xs transition-colors"
              >
                <span>Re-open Payment Gateway Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <Button variant="ghost" fullWidth onClick={handleReset}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
