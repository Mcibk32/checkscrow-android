import React from 'react';
import { PlusCircle, ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import { Button } from '../ui/Button';

export interface QuickActionsProps {
  onCreateEscrow: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onViewActivity: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onCreateEscrow,
  onDeposit,
  onWithdraw,
  onViewActivity,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
      <Button
        variant="primary"
        onClick={onCreateEscrow}
        leftIcon={<PlusCircle className="w-4 h-4" />}
        className="w-full justify-start sm:justify-center text-xs h-11"
      >
        New Escrow
      </Button>

      <Button
        variant="secondary"
        onClick={onDeposit}
        leftIcon={<ArrowDownLeft className="w-4 h-4 text-emerald-400" />}
        className="w-full justify-start sm:justify-center text-xs h-11"
      >
        Deposit Naira
      </Button>

      <Button
        variant="secondary"
        onClick={onWithdraw}
        leftIcon={<ArrowUpRight className="w-4 h-4 text-sky-400" />}
        className="w-full justify-start sm:justify-center text-xs h-11"
      >
        Withdraw
      </Button>

      <Button
        variant="outline"
        onClick={onViewActivity}
        leftIcon={<History className="w-4 h-4 text-slate-400" />}
        className="w-full justify-start sm:justify-center text-xs h-11"
      >
        Activity Logs
      </Button>
    </div>
  );
};
