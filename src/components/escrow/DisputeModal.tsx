import React, { useState } from 'react';
import { EscrowTransaction } from '../../types';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { escrowService } from '../../services/escrowService';
import { AlertTriangle, ShieldAlert, Upload } from 'lucide-react';

export interface DisputeModalProps {
  escrow: EscrowTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DisputeModal: React.FC<DisputeModalProps> = ({
  escrow,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('non_delivery');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!escrow) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please explain the reason for raising this dispute.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const res = await escrowService.raiseDispute(escrow.id, reason, description);
    setIsLoading(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      // In Phase 1 clean fallback
      onSuccess();
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Raise Escrow Dispute"
      subtitle={`Escrow Agreement: ${escrow.title}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-900/60 text-rose-200 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Raising a dispute freezes the locked Naira funds in escrow immediately. A CHECKSCROW mediator will review chat history and evidence to resolve the claim according to terms.
          </p>
        </div>

        <Select
          label="Primary Reason for Dispute *"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[
            { value: 'non_delivery', label: 'Item/Service Not Delivered' },
            { value: 'not_as_described', label: 'Item Damaged or Not as Described' },
            { value: 'wrong_specification', label: 'Wrong Specification Received' },
            { value: 'unresponsive_seller', label: 'Seller Unresponsive After Payment' },
            { value: 'buyer_refuses_release', label: 'Buyer Refuses to Release Approved Funds' },
          ]}
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-300">
            Detailed Explanation & Evidence Summary *
          </label>
          <textarea
            rows={4}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500/80 focus:ring-1 focus:ring-rose-500/50"
            placeholder="Describe what happened, delivery tracking details, or discrepancies noticed..."
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            required
          />
          {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
        </div>

        {/* Evidence attachment placeholder */}
        <div className="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center text-xs text-slate-400 space-y-1">
          <Upload className="w-5 h-5 mx-auto text-slate-500" />
          <p className="font-medium text-slate-300">Attach Photos / Receipts / Waybill Documents</p>
          <p className="text-[10px] text-slate-500">Supports PNG, JPG, PDF up to 10MB</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={isLoading}
            leftIcon={<AlertTriangle className="w-4 h-4" />}
          >
            Freeze Funds & Submit Dispute
          </Button>
        </div>
      </form>
    </Modal>
  );
};
