import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, CreditCard, Building2, CheckCircle2, XCircle, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { formatNaira } from '../utils/formatters';

export const PaymentCheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const reference = searchParams.get('reference');
  const amountParam = parseFloat(searchParams.get('amount') || '0');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!reference || amountParam <= 0) {
    return (
      <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-400 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Invalid Payment Reference</h2>
          <p className="text-xs text-slate-400">
            No valid checkout reference was provided. Please initiate a new deposit from your wallet.
          </p>
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate('/wallet')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Return to Wallet
          </Button>
        </div>
      </div>
    );
  }

  const handleAuthorizePayment = async () => {
    setIsProcessing(true);
    // Simulate gateway authorization delay before redirecting back to wallet for server verification
    setTimeout(() => {
      navigate(`/wallet?reference=${encodeURIComponent(reference)}&verify=true`);
    }, 1200);
  };

  const handleCancelPayment = () => {
    navigate(`/wallet`);
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Gateway Header */}
        <div className="bg-slate-900 p-6 border-b border-slate-800 text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Secure Payment Gateway Portal</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">CHECKSCROW Deposit Authorization</h2>
          <p className="text-xs text-slate-400">
            Reference: <span className="font-mono text-emerald-400">{reference}</span>
          </p>
        </div>

        {/* Transaction Summary */}
        <div className="p-6 space-y-6">
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>Merchant</span>
              <span className="font-sans font-bold text-slate-200">CHECKSCROW Escrow Ltd</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Transaction Type</span>
              <span className="font-sans font-medium text-slate-300">Wallet Funding</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="text-slate-300 font-bold font-sans">Total Amount</span>
              <span className="text-emerald-400 font-bold text-lg">{formatNaira(amountParam)}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-300 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Server-Side Verification Safeguard</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              Clicking authorize sends payment confirmation to the provider server. Wallet funds are strictly updated only upon server-side verification matching the transaction reference.
            </p>
          </div>

          <div className="space-y-2.5">
            <Button
              variant="primary"
              fullWidth
              isLoading={isProcessing}
              onClick={handleAuthorizePayment}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Authorize Payment (₦{amountParam.toLocaleString()})
            </Button>

            <Button
              variant="secondary"
              fullWidth
              disabled={isProcessing}
              onClick={handleCancelPayment}
              leftIcon={<XCircle className="w-4 h-4" />}
            >
              Cancel & Return to Wallet
            </Button>
          </div>
        </div>

        {/* Gateway Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center text-[11px] text-slate-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Encrypted with 256-bit TLS • PCI-DSS Compliant Gateway</span>
        </div>
      </div>
    </div>
  );
};
