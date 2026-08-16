import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDashboard } from '../hooks/useDashboard';
import { useActivity } from '../hooks/useActivity';
import { StatBox } from '../components/ui/StatBox';
import { QuickActions } from '../components/dashboard/QuickActions';
import { EscrowSummaryCard } from '../components/dashboard/EscrowSummaryCard';
import { TransactionList } from '../components/wallet/TransactionList';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorAlert } from '../components/ui/ErrorAlert';
import { DepositModal } from '../components/wallet/DepositModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { EscrowCreateModal } from '../components/escrow/EscrowCreateModal';
import { EscrowDetailModal } from '../components/escrow/EscrowDetailModal';
import { EscrowChatView } from '../components/escrow/EscrowChatView';
import { DisputeModal } from '../components/escrow/DisputeModal';
import { EscrowTransaction } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, Lock, ShieldCheck, ArrowRight, Activity, History } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, displayName, kycBadge, isAuthenticated } = useAuth();
  const { dashboardData, isLoading: isDashLoading, error: dashError, refetch: refetchDashboard } = useDashboard();
  const { activities } = useActivity();
  const navigate = useNavigate();

  // Modals state
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isCreateEscrowOpen, setIsCreateEscrowOpen] = useState(false);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowTransaction | null>(null);
  const [chatEscrow, setChatEscrow] = useState<EscrowTransaction | null>(null);
  const [disputeEscrow, setDisputeEscrow] = useState<EscrowTransaction | null>(null);

  const greeting = isAuthenticated && (dashboardData?.user?.name || user?.fullName) 
    ? `Welcome back, ${(dashboardData?.user?.name || user?.fullName || '').split(' ')[0]}` 
    : `Welcome, ${displayName}`;

  const availableBalance = dashboardData?.wallet?.availableBalance ?? 0;
  const escrowBalance = dashboardData?.wallet?.escrowBalance ?? 0;
  const pendingWithdrawalBalance = dashboardData?.wallet?.pendingWithdrawalBalance ?? 0;
  const activeEscrows = dashboardData?.activeEscrows ?? [];
  const recentTransactions = dashboardData?.recentTransactions ?? [];

  return (
    <div className="space-y-6">
      {/* Top Greeting & KYC Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111318] p-4.5 rounded-xl border border-[#1E293B]">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">{greeting}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Nigerian Escrow Marketplace • All transactions protected in Naira (₦)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/profile"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              kycBadge.variant === 'success'
                ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50'
                : kycBadge.variant === 'warning'
                ? 'bg-amber-950/80 border-amber-800/60 text-amber-300 hover:bg-amber-900/50'
                : kycBadge.variant === 'danger'
                ? 'bg-rose-950/80 border-rose-800/60 text-rose-300 hover:bg-rose-900/50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>KYC: {kycBadge.label.toUpperCase()}</span>
          </Link>
        </div>
      </div>

      {/* Connection / Backend status alert if error exists */}
      {dashError && (
        <ErrorAlert
          message={dashError}
          onRetry={() => {
            refetchDashboard();
          }}
        />
      )}

      {/* Financial Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatBox
          label="Available Balance"
          amount={availableBalance}
          subtext="Liquid funds ready for deposit or withdrawal"
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
        />

        <StatBox
          label="Escrow Protected Funds"
          amount={escrowBalance}
          subtext="Money safely locked in active deals"
          icon={<Lock className="w-5 h-5 text-amber-400" />}
        />

        <StatBox
          label="Pending Bank Transfers"
          amount={pendingWithdrawalBalance}
          subtext="Withdrawals processing to bank account"
          icon={<ShieldCheck className="w-5 h-5 text-sky-400" />}
        />
      </div>

      {/* Quick Action Controls */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Actions</h2>
        <QuickActions
          onCreateEscrow={() => setIsCreateEscrowOpen(true)}
          onDeposit={() => setIsDepositOpen(true)}
          onWithdraw={() => setIsWithdrawOpen(true)}
          onViewActivity={() => navigate('/activity')}
        />
      </div>

      {/* Active Escrow Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Escrow Transactions</h2>
          </div>
          <Link to="/escrow" className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-medium">
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isDashLoading ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-[#111318] rounded-xl border border-[#1E293B]">
            Loading active escrow transactions...
          </div>
        ) : activeEscrows.length === 0 ? (
          <EmptyState
            icon={<Lock className="w-6 h-6 text-slate-500" />}
            title="No Active Escrows"
            description="Start using CHECKSCROW to see your activity here. Create a new escrow agreement to safely buy or sell goods and services in Naira."
            actionLabel="Create Escrow"
            onAction={() => setIsCreateEscrowOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeEscrows.slice(0, 4).map((escrow) => (
              <EscrowSummaryCard
                key={escrow.id}
                escrow={escrow}
                onSelect={(e) => setSelectedEscrow(e)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Transactions</h2>
          </div>
          <Link to="/wallet" className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-medium">
            <span>Wallet History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <EmptyState
            icon={<History className="w-6 h-6 text-slate-500" />}
            title="Your transactions will appear here"
            description="Deposit funds or create an escrow transaction to start using your CHECKSCROW wallet."
            actionLabel="Deposit Money"
            onAction={() => setIsDepositOpen(true)}
          />
        ) : (
          <TransactionList transactions={recentTransactions.slice(0, 3)} isLoading={isDashLoading} />
        )}
      </div>

      {/* Recent Activity Log Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Activity Logs</h2>
          </div>
          <Link to="/activity" className="text-xs text-slate-400 hover:text-slate-200">
            Full Audit Log
          </Link>
        </div>

        {activities.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#111318] border border-[#1E293B] text-xs text-slate-500 text-center">
            No recent activity recorded on this account.
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#111318] border border-[#1E293B] space-y-2 text-xs">
            {activities.slice(0, 3).map((act) => (
              <div key={act.id} className="flex justify-between items-center py-1.5 border-b border-slate-800/60 last:border-0">
                <span className="text-slate-200 font-medium">{act.title}</span>
                <span className="text-slate-500 text-[11px]">{act.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        onSuccess={() => {
          refetchDashboard();
        }}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        availableBalance={availableBalance}
        onSuccess={() => {
          refetchDashboard();
        }}
      />

      <EscrowCreateModal
        isOpen={isCreateEscrowOpen}
        onClose={() => setIsCreateEscrowOpen(false)}
        onSuccess={() => {
          refetchDashboard();
        }}
      />

      <EscrowDetailModal
        escrow={selectedEscrow}
        isOpen={!!selectedEscrow}
        onClose={() => setSelectedEscrow(null)}
        onOpenChat={(e) => {
          setSelectedEscrow(null);
          setChatEscrow(e);
        }}
        onOpenDispute={(e) => {
          setSelectedEscrow(null);
          setDisputeEscrow(e);
        }}
        onStatusUpdated={() => {
          refetchDashboard();
        }}
      />

      <EscrowChatView
        escrow={chatEscrow}
        isOpen={!!chatEscrow}
        onClose={() => setChatEscrow(null)}
      />

      <DisputeModal
        escrow={disputeEscrow}
        isOpen={!!disputeEscrow}
        onClose={() => setDisputeEscrow(null)}
        onSuccess={() => {
          refetchDashboard();
        }}
      />
    </div>
  );
};
