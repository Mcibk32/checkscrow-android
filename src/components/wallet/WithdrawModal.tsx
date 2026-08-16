import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { walletService } from '../../services/walletService';
import { bankAccountService } from '../../services/bankAccountService';
import { formatNaira } from '../../utils/formatters';
import { BankAccount } from '../../types';
import { Building2, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  onSuccess: () => void;
}

const NIGERIAN_BANKS = [
  { value: '044', label: 'Access Bank' },
  { value: '011', label: 'First Bank of Nigeria' },
  { value: '058', label: 'GTBank (Guaranty Trust)' },
  { value: '033', label: 'United Bank for Africa (UBA)' },
  { value: '057', label: 'Zenith Bank' },
  { value: '50211', label: 'Kuda Bank' },
  { value: '999992', label: 'OPay Digital Services' },
  { value: '50515', label: 'Moniepoint Microfinance Bank' },
  { value: '035', label: 'Wema Bank (ALAT)' },
  { value: '214', label: 'FCMB' },
  { value: '070', label: 'Fidelity Bank' },
  { value: '221', label: 'Stanbic IBTC Bank' },
];

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  availableBalance,
  onSuccess,
}) => {
  const [savedAccounts, setSavedAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('new');
  
  const [amount, setAmount] = useState<string>('');
  const [bankCode, setBankCode] = useState<string>('058');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [isVerifyingAccount, setIsVerifyingAccount] = useState<boolean>(false);
  const [isAccountVerified, setIsAccountVerified] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ reference: string; status: string; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSavedAccounts();
    }
  }, [isOpen]);

  const loadSavedAccounts = async () => {
    const res = await bankAccountService.getBankAccounts();
    if (res.success && res.data && res.data.length > 0) {
      setSavedAccounts(res.data);
      const defaultAcc = res.data.find(a => a.isDefault) || res.data[0];
      setSelectedAccountId(defaultAcc.id);
    } else {
      setSavedAccounts([]);
      setSelectedAccountId('new');
    }
  };

  const handleResolveName = async (accNum: string, bCode: string) => {
    if (accNum.length !== 10 || !/^\d+$/.test(accNum)) return;
    setIsVerifyingAccount(true);
    const res = await bankAccountService.resolveAccountName(accNum, bCode);
    setIsVerifyingAccount(false);

    if (res.success && res.data && res.data.verified) {
      setAccountName(res.data.accountName);
      setIsAccountVerified(true);
    } else {
      setIsAccountVerified(false);
      setAccountName('ACCOUNT HOLDER');
    }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid withdrawal amount.');
      return;
    }

    if (numAmount > availableBalance) {
      setError(`Insufficient available balance. Maximum available: ${formatNaira(availableBalance)}`);
      return;
    }

    setIsLoading(true);
    setError(null);

    let payload: any = { amount: numAmount };

    if (selectedAccountId !== 'new') {
      payload.bankAccountId = selectedAccountId;
    } else {
      if (accountNumber.length !== 10) {
        setError('Nigerian bank account number must be exactly 10 digits.');
        setIsLoading(false);
        return;
      }
      const selectedBankName = NIGERIAN_BANKS.find(b => b.value === bankCode)?.label || 'Bank';
      payload.bankCode = bankCode;
      payload.bankName = selectedBankName;
      payload.accountNumber = accountNumber;
      payload.accountName = accountName || 'ACCOUNT HOLDER';
    }

    const res = await walletService.initiateWithdrawal(payload);
    setIsLoading(false);

    if (res.success && res.data) {
      setSuccessResult({
        reference: res.data.reference,
        status: res.data.status,
        message: res.message || 'Withdrawal submitted successfully.',
      });
      onSuccess();
    } else {
      setError(res.error || 'Failed to initiate withdrawal. Please verify your details.');
    }
  };

  const handleReset = () => {
    setAmount('');
    setAccountNumber('');
    setAccountName('');
    setIsAccountVerified(false);
    setError(null);
    setSuccessResult(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleReset}
      title="Withdraw Funds to Bank Account"
      subtitle={`Available for withdrawal: ${formatNaira(availableBalance)}`}
    >
      {!successResult ? (
        <form onSubmit={handleWithdrawal} className="space-y-4">
          <Input
            label="Withdrawal Amount (₦)"
            type="number"
            prefixSymbol="₦"
            placeholder="e.g. 25000"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            error={error || undefined}
            helperText={`Available balance: ${formatNaira(availableBalance)}`}
            required
            autoFocus
          />

          {savedAccounts.length > 0 && (
            <Select
              label="Select Bank Account"
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setError(null);
              }}
              options={[
                ...savedAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.bankName} - ${a.maskedAccountNumber} (${a.accountName})`,
                })),
                { value: 'new', label: '+ Add New Bank Account' },
              ]}
            />
          )}

          {selectedAccountId === 'new' && (
            <>
              <Select
                label="Bank Name"
                value={bankCode}
                onChange={(e) => {
                  setBankCode(e.target.value);
                  if (accountNumber.length === 10) {
                    handleResolveName(accountNumber, e.target.value);
                  }
                }}
                options={NIGERIAN_BANKS}
              />

              <Input
                label="Account Number (10 Digits)"
                type="text"
                placeholder="0123456789"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setAccountNumber(val);
                  if (val.length === 10) {
                    handleResolveName(val, bankCode);
                  } else {
                    setAccountName('');
                    setIsAccountVerified(false);
                  }
                }}
                required
              />

              {isVerifyingAccount && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                  <span>Verifying bank account name via Paystack...</span>
                </div>
              )}

              {!isVerifyingAccount && accountName && (
                <div className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                  isAccountVerified 
                    ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-300' 
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Account Holder: <strong>{accountName}</strong></span>
                </div>
              )}
            </>
          )}

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <span className="text-slate-300 font-semibold block">NIBSS Instant Payout Protection</span>
            <p>
              Requested withdrawals temporarily reserve money in pending balance until confirmation. If a transfer fails, reserved funds automatically return to your available balance.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Confirm Withdrawal
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-slate-100">Withdrawal Request Submitted</h4>
          <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
            {successResult.message}
          </p>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1 text-left">
            <div className="flex justify-between text-slate-400">
              <span>Reference:</span>
              <span className="font-mono text-slate-200">{successResult.reference}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Status:</span>
              <span className="capitalize font-semibold text-amber-400">{successResult.status}</span>
            </div>
          </div>
          <Button variant="primary" fullWidth onClick={handleReset}>
            Done
          </Button>
        </div>
      )}
    </Modal>
  );
};
