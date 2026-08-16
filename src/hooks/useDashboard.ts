import { useState, useEffect, useCallback } from 'react';
import { dashboardService, DashboardResponseData } from '../services/dashboardService';

export const useDashboard = () => {
  const [data, setData] = useState<DashboardResponseData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await dashboardService.getDashboardData();
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to load dashboard data.');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to backend dashboard endpoint.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    dashboardData: data,
    isLoading,
    error,
    refetch: fetchDashboard,
  };
};
