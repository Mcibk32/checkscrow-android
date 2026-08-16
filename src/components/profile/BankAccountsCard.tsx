import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { bankAccountService } from '../../services/bankAccountService';
import { BankAccount } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { Building2, Plus, Trash2, Check, ShieldCheck, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

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

export const BankAccountsCard: React.FC = () => {
  const { isGuestExplorer } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Form states
  const [bankCode, setBankCode] = useState<string>('058');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setIsLoading(true);
    const res = await bankAccountService.getBankAccounts();
    setIsLoading(false);
    if (res.success && res.data) {
      setAccounts(res.data);
    }
  };

  const handleResolveName = async (accNum: string, bCode: string) => {
    if (accNum.length !== 10 || !/^\d+$/.test(accNum)) return;
    setIsVerifying(true);
    setError(null);
    const res = await bankAccountService.resolveAccountName(accNum, bCode);
    setIsVerifying(false);

    if (res.success && res.data && res.data.verified) {
      setAccountName(res.data.accountName);
    } else {
      setAccountName('ACCOUNT HOLDER');
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuestExplorer) {
      setError('Guest mode cannot add saved bank accounts.');
      return;
    }

    if (accountNumber.length !== 10) {
      setError('Account number must be exactly 10 digits.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const selectedBank = NIGERIAN_BANKS.find(b => b.value === bankCode)?.label || 'Bank';

    const res = await bankAccountService.addBankAccount({
      bankCode,
      bankName: selectedBank,
      accountNumber,
      accountName: accountName || 'ACCOUNT HOLDER',
      isDefault: accounts.length === 0 ? true : isDefault,
    });

    setIsSaving(false);

    if (res.success) {
      setMessage('Bank account added successfully.');
      setAccountNumber('');
      setAccountName('');
      setShowAddForm(false);
      loadAccounts();
    } else {
      setError(res.error || 'Failed to add bank account.');
    }
  };

  const handleSetDefault = async (id: string) => {
    setError(null);
    setMessage(null);
    const res = await bankAccountService.updateBankAccount(id, { isDefault: true });
    if (res.success) {
      setMessage('Default withdrawal account updated.');
      loadAccounts();
    } else {
      setError(res.error || 'Failed to update default account.');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setMessage(null);
    const res = await bankAccountService.deleteBankAccount(id);
    if (res.success) {
      setMessage('Bank account removed.');
      loadAccounts();
    } else {
      setError(res.error || 'Failed to delete bank account.');
    }
  };

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100">Saved Settlement Bank Accounts</h3>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
            setMessage(null);
          }}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          {showAddForm ? 'Cancel' : 'Add Bank Account'}
        </Button>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-xs text-emerald-300 mt-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300 mt-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Add Bank Account Form */}
      {showAddForm && (
        <form onSubmit={handleAddAccount} className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold text-slate-200">New Settlement Account Details</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Select Bank"
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
                }
              }}
              required
            />
          </div>

          {isVerifying && (
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <span>Verifying account name via Paystack...</span>
            </div>
          )}

          {!isVerifying && accountName && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Account Holder: <strong>{accountName}</strong></span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefaultAcc"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded bg-slate-900 border-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <label htmlFor="isDefaultAcc" className="text-xs text-slate-300 cursor-pointer">
              Set as primary account for instant withdrawals
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              leftIcon={<Building2 className="w-4 h-4" />}
            >
              Save Account
            </Button>
          </div>
        </form>
      )}

      {/* Account List */}
      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-xs text-slate-500 py-4 text-center">Loading bank accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            No bank accounts saved yet. Add a bank account for instant NIBSS withdrawals.
          </p>
        ) : (
          accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100">{acc.bankName}</span>
                    {acc.isDefault && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">
                    {acc.maskedAccountNumber || '••••••••' + acc.accountNumber?.slice(-4)} — <span className="text-slate-400 font-sans">{acc.accountName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {!acc.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault(acc.id)}
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                  >
                    Set Default
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(acc.id)}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
