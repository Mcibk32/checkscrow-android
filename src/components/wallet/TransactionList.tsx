import React from 'react';
import { WalletTransaction } from '../../types';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { formatNaira, formatDate, truncateRef } from '../../utils/formatters';
import { ArrowDownLeft, ArrowUpRight, Lock, Unlock, AlertCircle, History } from 'lucide-react';

export interface TransactionListProps {
  transactions: WalletTransaction[];
  isLoading?: boolean;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse flex items-center justify-between">
            <div className="h-4 w-1/3 bg-slate-800 rounded" />
            <div className="h-4 w-1/4 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-6 h-6 text-slate-500" />}
        title="No Wallet Transactions Yet"
        description="Your wallet activity log will record all deposits, withdrawals, and escrow locks here as transactions occur."
      />
    );
  }

  const getTxIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownLeft className="w-4 h-4 text-emerald-400" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4 text-sky-400" />;
      case 'escrow_lock':
        return <Lock className="w-4 h-4 text-amber-400" />;
      case 'escrow_release':
      case 'escrow_refund':
        return <Unlock className="w-4 h-4 text-emerald-400" />;
      default:
        return <History className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
              {getTxIcon(tx.type)}
            </div>
            <div>
              <p className="font-semibold text-slate-100 capitalize">
                {tx.description || tx.type.replace('_', ' ')}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                <span>Ref: {truncateRef(tx.reference)}</span>
                <span>•</span>
                <span>{formatDate(tx.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div
              className={`font-mono font-bold text-sm tabular-nums ${
                tx.type === 'deposit' || tx.type === 'escrow_release' || tx.type === 'escrow_refund'
                  ? 'text-emerald-400'
                  : 'text-slate-200'
              }`}
            >
              {tx.type === 'deposit' || tx.type === 'escrow_release' || tx.type === 'escrow_refund' ? '+' : '-'}
              {formatNaira(tx.amount)}
            </div>
            <div className="mt-1">
              {getStatusBadge(tx.status)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
