import React from 'react';
import { WalletBalance } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { CurrencyDisplay } from '../ui/CurrencyDisplay';
import { ArrowDownLeft, ArrowUpRight, Wallet, Lock, Info } from 'lucide-react';

export interface WalletBalanceCardProps {
  balance: WalletBalance | null;
  onDeposit: () => void;
  onWithdraw: () => void;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({
  balance,
  onDeposit,
  onWithdraw,
}) => {
  const available = balance?.availableBalance ?? 0;
  const escrowLocked = balance?.escrowBalance ?? 0;
  const pendingWithdrawal = balance?.pendingWithdrawalBalance ?? 0;

  return (
    <Card variant="default" padding="lg" className="border-emerald-900/30 bg-[#111318] relative overflow-hidden">
      {/* Subtle background glow accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-6">
        {/* Main Available Wallet Balance */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span>Available Wallet Balance</span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800/40">
                Liquid
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold font-mono text-slate-100 tracking-tight mt-1 tabular-nums">
              <CurrencyDisplay amount={available} symbolClassName="text-emerald-400" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ready for immediate withdrawal or funding new escrows.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="primary"
              size="md"
              onClick={onDeposit}
              leftIcon={<ArrowDownLeft className="w-4 h-4" />}
            >
              Deposit Naira
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={onWithdraw}
              leftIcon={<ArrowUpRight className="w-4 h-4 text-sky-400" />}
            >
              Withdraw
            </Button>
          </div>
        </div>

        {/* Breakdown separating Wallet Money vs Escrow Money */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-800/80">
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <span>Escrow Locked Funds</span>
                <span title="Funds protected in active escrow transactions">
                  <Info className="w-3 h-3 text-slate-500" />
                </span>
              </div>
              <div className="text-lg font-bold font-mono text-slate-100 tabular-nums mt-0.5">
                <CurrencyDisplay amount={escrowLocked} symbolClassName="text-amber-400" />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Held safely until buyer confirms order completion.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-sky-950/80 border border-sky-800/50 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                Pending Bank Withdrawals
              </div>
              <div className="text-lg font-bold font-mono text-slate-100 tabular-nums mt-0.5">
                <CurrencyDisplay amount={pendingWithdrawal} symbolClassName="text-sky-400" />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Processing to your registered Nigerian bank account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
