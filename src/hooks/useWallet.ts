import { useState, useEffect, useCallback } from 'react';
import { WalletBalance, WalletTransaction } from '../types';
import { walletService } from '../services/walletService';

export const useWallet = () => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWalletData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [balanceRes, txRes] = await Promise.all([
        walletService.getBalance(),
        walletService.getTransactions(),
      ]);

      if (balanceRes.success && balanceRes.data) {
        setBalance(balanceRes.data);
      } else {
        // Default zero balance when backend endpoint returns empty/unavailable
        setBalance({
          availableBalance: 0,
          escrowBalance: 0,
          pendingWithdrawalBalance: 0,
          currency: 'NGN',
        });
      }

      if (txRes.success && txRes.data?.transactions) {
        setTransactions(txRes.data.transactions);
      } else {
        setTransactions([]);
      }
    } catch {
      setError('Unable to fetch wallet details. Backend endpoint offline.');
      setBalance({
        availableBalance: 0,
        escrowBalance: 0,
        pendingWithdrawalBalance: 0,
        currency: 'NGN',
      });
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  return {
    balance,
    transactions,
    isLoading,
    error,
    refetch: fetchWalletData,
  };
};
