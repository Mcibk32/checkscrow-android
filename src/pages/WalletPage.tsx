import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { WalletBalanceCard } from '../components/wallet/WalletBalanceCard';
import { TransactionList } from '../components/wallet/TransactionList';
import { DepositModal } from '../components/wallet/DepositModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { ErrorAlert } from '../components/ui/ErrorAlert';
import { Wallet, History } from 'lucide-react';

export const WalletPage: React.FC = () => {
  const { balance, transactions, isLoading, error, refetch } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [verifyRef, setVerifyRef] = useState<string | null>(null);

  // Check URL query parameters for payment return verification (e.g. ?reference=CHK-DEP-...&verify=true)
  useEffect(() => {
    const ref = searchParams.get('reference');
    const verify = searchParams.get('verify');
    if (ref && verify === 'true') {
      setVerifyRef(ref);
      setIsDepositOpen(true);
      // Clean query params from URL without refreshing page
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <span>Naira Wallet (₦)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage deposits, withdrawals, and monitor escrow-locked funds in Naira.
          </p>
        </div>
      </div>

      {error && (
        <ErrorAlert message={error} onRetry={refetch} />
      )}

      {/* Wallet Balance Hero Card */}
      <WalletBalanceCard
        balance={balance}
        onDeposit={() => {
          setVerifyRef(null);
          setIsDepositOpen(true);
        }}
        onWithdraw={() => setIsWithdrawOpen(true)}
      />

      {/* Transaction History Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Wallet Transaction History
            </h2>
          </div>
        </div>

        <TransactionList
          transactions={transactions}
          isLoading={isLoading}
        />
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={isDepositOpen}
        initialReference={verifyRef}
        onClose={() => {
          setIsDepositOpen(false);
          setVerifyRef(null);
        }}
        onSuccess={() => refetch()}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        availableBalance={balance?.availableBalance ?? 0}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
