import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { escrowService, CreateEscrowPayload } from '../../services/escrowService';
import { ShieldCheck, ArrowRight, Lock, UserCheck } from 'lucide-react';

export interface EscrowCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EscrowCreateModal: React.FC<EscrowCreateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<CreateEscrowPayload>({
    title: '',
    description: '',
    amount: 0,
    role: 'buyer',
    counterpartyEmail: '',
    counterpartyPhone: '',
    inspectionPeriodDays: 3,
    terms: '',
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || formData.amount <= 0 || !formData.counterpartyEmail) {
      setError('Please complete all required fields (title, positive amount, counterparty email).');
      return;
    }

    setIsLoading(true);
    setError(null);

    const res = await escrowService.createEscrow(formData);
    setIsLoading(false);

    if (res.success) {
      onSuccess();
      handleClose();
    } else {
      setError(res.error || 'Failed to create escrow agreement. Please try again.');
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      amount: 0,
      role: 'buyer',
      counterpartyEmail: '',
      counterpartyPhone: '',
      inspectionPeriodDays: 3,
      terms: '',
    });
    setError(null);
    onClose();
  };

  const feePercentage = 1.5; // 1.5% CHECKSCROW platform escrow fee
  const calculatedFee = (formData.amount * feePercentage) / 100;
  const totalAmount = formData.amount + calculatedFee;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Escrow Agreement"
      subtitle="Establish a safe transaction protected by CHECKSCROW Naira escrow."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-rose-400 font-medium bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Transaction Title *"
            placeholder="e.g. iPhone 15 Pro Max Purchase or Web Design Service"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          <Select
            label="Your Role in Transaction *"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as 'buyer' | 'seller' })}
            options={[
              { value: 'buyer', label: 'I am the BUYER (I am paying)' },
              { value: 'seller', label: 'I am the SELLER (I am delivering goods/services)' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Agreed Amount (₦) *"
            type="number"
            prefixSymbol="₦"
            placeholder="e.g. 150000"
            value={formData.amount > 0 ? formData.amount : ''}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            required
          />

          <Select
            label="Inspection Period *"
            value={formData.inspectionPeriodDays.toString()}
            onChange={(e) => setFormData({ ...formData, inspectionPeriodDays: parseInt(e.target.value) })}
            options={[
              { value: '1', label: '1 Day (24 Hours Inspection)' },
              { value: '2', label: '2 Days Inspection' },
              { value: '3', label: '3 Days Inspection (Recommended)' },
              { value: '5', label: '5 Days Inspection' },
              { value: '7', label: '7 Days Inspection' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={formData.role === 'buyer' ? "Seller's Email Address *" : "Buyer's Email Address *"}
            type="email"
            placeholder="counterparty@example.com"
            value={formData.counterpartyEmail}
            onChange={(e) => setFormData({ ...formData, counterpartyEmail: e.target.value })}
            required
          />

          <Input
            label="Counterparty Phone Number (Optional)"
            type="tel"
            placeholder="08012345678"
            value={formData.counterpartyPhone}
            onChange={(e) => setFormData({ ...formData, counterpartyPhone: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-300">
            Escrow Terms & Item Description
          </label>
          <textarea
            rows={3}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50"
            placeholder="Detail item condition, delivery timeline, serial numbers, or agreed deliverable specifications..."
            value={formData.terms}
            onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
          />
        </div>

        {/* Cost & Protection Summary */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span>Escrow Item Value:</span>
            <span className="font-mono text-slate-200">₦{formData.amount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Platform Escrow Protection Fee (1.5%):</span>
            <span className="font-mono text-slate-200">₦{calculatedFee.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-bold text-sm text-emerald-400">
            <span>Total Lock Amount:</span>
            <span className="font-mono">₦{totalAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Create Escrow Agreement
          </Button>
        </div>
      </form>
    </Modal>
  );
};
