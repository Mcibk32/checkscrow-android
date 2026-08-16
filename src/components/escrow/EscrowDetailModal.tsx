import React, { useState } from 'react';
import { EscrowTransaction } from '../../types';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatNaira, formatDate } from '../../utils/formatters';
import { Lock, ShieldCheck, User, Calendar, MessageSquare, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { escrowService } from '../../services/escrowService';

export interface EscrowDetailModalProps {
  escrow: EscrowTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenChat: (escrow: EscrowTransaction) => void;
  onOpenDispute: (escrow: EscrowTransaction) => void;
  onStatusUpdated: () => void;
}

export const EscrowDetailModal: React.FC<EscrowDetailModalProps> = ({
  escrow,
  isOpen,
  onClose,
  onOpenChat,
  onOpenDispute,
  onStatusUpdated,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!escrow) return null;

  const handleFund = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    const res = await escrowService.fundEscrow(escrow.id);
    setIsProcessing(false);
    if (res.success) {
      onStatusUpdated();
    } else {
      setErrorMsg(res.error || 'Failed to fund escrow.');
    }
  };

  const handleDeliver = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    const res = await escrowService.markDelivered(escrow.id);
    setIsProcessing(false);
    if (res.success) {
      onStatusUpdated();
    } else {
      setErrorMsg(res.error || 'Failed to mark as delivered.');
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    const res = await escrowService.confirmCompletion(escrow.id);
    setIsProcessing(false);
    if (res.success) {
      onStatusUpdated();
    } else {
      setErrorMsg(res.error || 'Failed to confirm release.');
    }
  };

  const handleCancel = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    const res = await escrowService.cancelEscrow(escrow.id);
    setIsProcessing(false);
    if (res.success) {
      onStatusUpdated();
    } else {
      setErrorMsg(res.error || 'Failed to cancel escrow.');
    }
  };

  const isFundedState = escrow.status === 'funded' || escrow.status === 'in_escrow' || escrow.status === 'in_progress';

  const statusSteps = [
    { key: 'awaiting_payment', label: '1. Awaiting Deposit' },
    { key: 'funded', label: '2. Funds In Escrow' },
    { key: 'delivered', label: '3. Delivered & Inspection' },
    { key: 'completed', label: '4. Funds Released' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={escrow.title}
      subtitle={`Escrow ID: ${escrow.id}`}
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Top Status & Amount Header */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Escrow Amount</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {formatNaira(escrow.amount)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Fee: {formatNaira(escrow.feeAmount)} • Total: {formatNaira(escrow.totalAmount)}
            </p>
          </div>

          <div className="sm:text-right">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Status</span>
            <Badge variant={escrow.status === 'completed' ? 'success' : escrow.status === 'disputed' ? 'danger' : 'emerald'} size="md">
              {escrow.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">Escrow Lifecycle Progress</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800 text-[11px]">
            {statusSteps.map((step) => {
              const isCurrent = escrow.status === step.key;
              return (
                <div
                  key={step.key}
                  className={`p-2 rounded-lg text-center transition-colors ${
                    isCurrent
                      ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800/60'
                      : 'text-slate-500'
                  }`}
                >
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actor Guidance Banner */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Escrow Status Guidance</span>
          </div>
          <div className="text-[11px] text-slate-300 space-y-1 leading-relaxed">
            {escrow.status === 'awaiting_payment' && escrow.userRole === 'buyer' && (
              <p>
                <strong className="text-white">Action Required (Buyer):</strong> Deposit funds into escrow to lock the agreement. The seller will be notified to start fulfillment once funds are secured.
              </p>
            )}
            {escrow.status === 'awaiting_payment' && escrow.userRole === 'seller' && (
              <p>
                <strong className="text-white">Awaiting Buyer:</strong> Waiting for the buyer to deposit ₦{escrow.totalAmount?.toLocaleString()} into escrow. Do not send goods or start services until funds are verified in escrow.
              </p>
            )}
            {isFundedState && escrow.userRole === 'seller' && (
              <p>
                <strong className="text-white">Action Required (Seller):</strong> Funds are securely locked in CHECKSCROW. Please fulfill and deliver the agreed item or service, then click &quot;Mark Goods/Service Delivered&quot;.
              </p>
            )}
            {isFundedState && escrow.userRole === 'buyer' && (
              <p>
                <strong className="text-white">In Progress:</strong> Your funds are safely held in escrow. The seller is currently preparing and delivering your order.
              </p>
            )}
            {escrow.status === 'delivered' && escrow.userRole === 'buyer' && (
              <p>
                <strong className="text-white">Action Required (Buyer):</strong> The seller has marked this order delivered. Inspect the goods/services. If satisfied, click &quot;Confirm & Release Funds&quot; to credit the seller.
              </p>
            )}
            {escrow.status === 'delivered' && escrow.userRole === 'seller' && (
              <p>
                <strong className="text-white">Inspection Period:</strong> Delivery recorded. The buyer is inspecting the items. Once confirmed, funds will be automatically credited to your available balance.
              </p>
            )}
            {escrow.status === 'completed' && (
              <p>
                <strong className="text-emerald-400">Escrow Completed:</strong> Transaction successfully finalized. Funds have been credited to the seller.
              </p>
            )}
            {escrow.status === 'disputed' && (
              <p>
                <strong className="text-rose-400">Dispute Under Review:</strong> A moderator is reviewing the agreement and chat logs to issue a fair resolution or settlement.
              </p>
            )}
            {(escrow.status === 'cancelled' || escrow.status === 'refunded') && (
              <p>
                <strong className="text-slate-400">Deal Cancelled:</strong> Escrow deal was cancelled and funds refunded to the buyer.
              </p>
            )}
          </div>
        </div>

        {/* Counterparty & Inspection Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium uppercase tracking-wider text-[10px]">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>Counterparty Info</span>
            </div>
            <p className="font-semibold text-slate-100">{escrow.counterpartyName}</p>
            <p className="text-slate-400">{escrow.counterpartyEmail}</p>
            {escrow.counterpartyPhone && <p className="text-slate-500">{escrow.counterpartyPhone}</p>}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium uppercase tracking-wider text-[10px]">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Inspection & Deadline</span>
            </div>
            <p className="font-semibold text-slate-100">{escrow.inspectionPeriodDays} Days Inspection Period</p>
            <p className="text-slate-400">Deadline: {formatDate(escrow.deadline)}</p>
          </div>
        </div>

        {/* Terms */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-300">Agreed Terms & Conditions</label>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-28 overflow-y-auto">
            {escrow.terms || escrow.description || 'Standard CHECKSCROW marketplace agreement terms apply.'}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChat(escrow)}
              leftIcon={<MessageSquare className="w-4 h-4 text-emerald-400" />}
            >
              Escrow Chat
            </Button>

            {escrow.status !== 'completed' && escrow.status !== 'disputed' && escrow.status !== 'cancelled' && escrow.status !== 'refunded' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenDispute(escrow)}
                leftIcon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
              >
                Raise Dispute
              </Button>
            )}

            {escrow.status === 'awaiting_payment' && (
              <Button
                variant="ghost"
                size="sm"
                isLoading={isProcessing}
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancel Deal
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {escrow.status === 'awaiting_payment' && escrow.userRole === 'buyer' && (
              <Button
                variant="primary"
                size="sm"
                isLoading={isProcessing}
                onClick={handleFund}
                leftIcon={<Lock className="w-4 h-4" />}
              >
                Deposit Funds to Escrow
              </Button>
            )}

            {isFundedState && escrow.userRole === 'seller' && (
              <Button
                variant="primary"
                size="sm"
                isLoading={isProcessing}
                onClick={handleDeliver}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Mark Goods/Service Delivered
              </Button>
            )}

            {escrow.status === 'delivered' && escrow.userRole === 'buyer' && (
              <Button
                variant="primary"
                size="sm"
                isLoading={isProcessing}
                onClick={handleConfirm}
                leftIcon={<ShieldCheck className="w-4 h-4" />}
              >
                Confirm & Release Funds
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
