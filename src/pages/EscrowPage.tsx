import React, { useState } from 'react';
import { useEscrow } from '../hooks/useEscrow';
import { EscrowSummaryCard } from '../components/dashboard/EscrowSummaryCard';
import { EscrowCreateModal } from '../components/escrow/EscrowCreateModal';
import { EscrowDetailModal } from '../components/escrow/EscrowDetailModal';
import { EscrowChatView } from '../components/escrow/EscrowChatView';
import { DisputeModal } from '../components/escrow/DisputeModal';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { EscrowTransaction } from '../types';
import { Lock, PlusCircle, Filter } from 'lucide-react';

export const EscrowPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed' | 'disputed'>('all');
  const { escrows, isLoading, refetch } = useEscrow(activeTab === 'all' ? undefined : activeTab);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowTransaction | null>(null);
  const [chatEscrow, setChatEscrow] = useState<EscrowTransaction | null>(null);
  const [disputeEscrow, setDisputeEscrow] = useState<EscrowTransaction | null>(null);

  const filteredEscrows = escrows.filter((e) => {
    if (activeTab === 'active') return e.status === 'in_escrow' || e.status === 'awaiting_payment' || e.status === 'delivered';
    if (activeTab === 'completed') return e.status === 'completed';
    if (activeTab === 'disputed') return e.status === 'disputed';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            <span>Escrow Transactions</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your buyer and seller escrow deals safely in Nigerian Naira (₦).
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsCreateModalOpen(true)}
          leftIcon={<PlusCircle className="w-4 h-4" />}
        >
          Create Escrow Deal
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800/80">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          All Deals
        </button>

        <button
          onClick={() => setActiveTab('active')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'active'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Active / In Escrow
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'completed'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Completed
        </button>

        <button
          onClick={() => setActiveTab('disputed')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'disputed'
              ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Disputed
        </button>
      </div>

      {/* Escrow Deals List / Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading escrow records...</div>
      ) : filteredEscrows.length === 0 ? (
        <EmptyState
          icon={<Lock className="w-6 h-6 text-slate-500" />}
          title={`No ${activeTab.toUpperCase()} Escrow Agreements`}
          description="Create a new escrow agreement to start a secure transaction between buyer and seller."
          actionLabel="Create New Escrow Agreement"
          onAction={() => setIsCreateModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredEscrows.map((item) => (
            <EscrowSummaryCard
              key={item.id}
              escrow={item}
              onSelect={(e) => setSelectedEscrow(e)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <EscrowCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => refetch()}
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
        onStatusUpdated={() => refetch()}
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
        onSuccess={() => refetch()}
      />
    </div>
  );
};
