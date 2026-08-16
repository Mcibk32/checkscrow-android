import React from 'react';
import { EscrowTransaction } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { CurrencyDisplay } from '../ui/CurrencyDisplay';
import { formatDate } from '../../utils/formatters';
import { Lock, ArrowRight, User, Calendar } from 'lucide-react';

export interface EscrowSummaryCardProps {
  escrow: EscrowTransaction;
  onSelect: (escrow: EscrowTransaction) => void;
}

export const EscrowSummaryCard: React.FC<EscrowSummaryCardProps> = ({ escrow, onSelect }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_escrow':
        return <Badge variant="emerald">Funds In Escrow</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'awaiting_payment':
        return <Badge variant="warning">Awaiting Deposit</Badge>;
      case 'disputed':
        return <Badge variant="danger">Disputed</Badge>;
      default:
        return <Badge variant="neutral">{status.replace('_', ' ')}</Badge>;
    }
  };

  return (
    <Card
      variant="default"
      padding="sm"
      className="hover:border-slate-700 transition-all cursor-pointer group bg-[#111318]"
      onClick={() => onSelect(escrow)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center text-emerald-400 shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-1">
              {escrow.title}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {escrow.userRole === 'buyer' ? `Seller: ${escrow.counterpartyName}` : `Buyer: ${escrow.counterpartyName}`}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-mono font-bold text-slate-100 tabular-nums">
            <CurrencyDisplay amount={escrow.amount} symbolClassName="text-emerald-400" />
          </div>
          <div className="mt-1">
            {getStatusBadge(escrow.status)}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          <span>Deadline: {formatDate(escrow.deadline)}</span>
        </div>
        <div className="flex items-center gap-1 text-emerald-400 font-medium group-hover:translate-x-0.5 transition-transform">
          <span>View Details</span>
          <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </Card>
  );
};
