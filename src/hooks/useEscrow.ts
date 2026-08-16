import { useState, useEffect, useCallback } from 'react';
import { EscrowTransaction } from '../types';
import { escrowService } from '../services/escrowService';

export const useEscrow = (filterStatus?: string) => {
  const [escrows, setEscrows] = useState<EscrowTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEscrows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await escrowService.getEscrows(filterStatus);
      if (res.success && res.data) {
        setEscrows(res.data);
      } else {
        setEscrows([]);
        if (!res.success && res.error) {
          setError(res.error);
        }
      }
    } catch {
      setError('Failed to load escrow transactions.');
      setEscrows([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  return {
    escrows,
    isLoading,
    error,
    refetch: fetchEscrows,
  };
};
