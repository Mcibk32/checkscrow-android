import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Users,
  ShieldCheck,
  Briefcase,
  Scale,
  ArrowUpRight,
  CreditCard,
  FileText,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
  UserCheck,
  Filter,
  Eye,
  UserX,
  ChevronLeft,
  ChevronRight,
  Sliders,
  DollarSign,
  Info,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  adminService,
  AdminStats,
  AdminUserItem,
  AdminUserDetail,
  KycApplicationItem,
  AdminEscrowItem,
  AdminDisputeItem,
  AdminWithdrawalItem,
  AdminPaymentItem,
  AdminAuditLogItem,
} from '../services/adminService';
import { formatNaira } from '../utils/formatters';

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'kyc'
  | 'escrows'
  | 'disputes'
  | 'withdrawals'
  | 'payments'
  | 'audit-logs';

export const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Verify Role
  const isAuthorized = user?.role === 'admin' || user?.role === 'moderator';

  // State
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Pagination & Filters
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Tab Data States
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [kycList, setKycList] = useState<KycApplicationItem[]>([]);
  const [escrows, setEscrows] = useState<AdminEscrowItem[]>([]);
  const [disputes, setDisputes] = useState<AdminDisputeItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalItem[]>([]);
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(false);

  // Modals
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [statusModalUser, setStatusModalUser] = useState<AdminUserItem | null>(null);
  const [newStatus, setNewStatus] = useState<'active' | 'suspended' | 'inactive'>('suspended');

  const [roleModalUser, setRoleModalUser] = useState<AdminUserItem | null>(null);
  const [newRole, setNewRole] = useState<'user' | 'moderator' | 'admin'>('user');

  const [rejectKycUserId, setRejectKycUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const [resolveDisputeItem, setResolveDisputeItem] = useState<AdminDisputeItem | null>(null);
  const [resolutionType, setResolutionType] = useState<'refund_buyer' | 'release_to_seller' | 'split'>('refund_buyer');
  const [splitBuyerAmount, setSplitBuyerAmount] = useState<string>('');
  const [splitSellerAmount, setSplitSellerAmount] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Load Dashboard Statistics
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await adminService.getStats();
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setErrorMsg(res.error || 'Failed to load statistics.');
      }
    } catch (err: any) {
      setErrorMsg('Error loading dashboard statistics.');
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchStats();
    }
  }, [isAuthorized]);

  // Load Tab Data whenever Tab, Page, Search or Filters change
  useEffect(() => {
    if (!isAuthorized) return;

    const loadTabData = async () => {
      setDataLoading(true);
      setErrorMsg('');
      try {
        if (activeTab === 'users') {
          const res = await adminService.getUsers({
            page,
            limit: 15,
            search,
            account_status: statusFilter,
            role: roleFilter,
          });
          if (res.success && res.data) {
            setUsers(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        } else if (activeTab === 'kyc') {
          const res = await adminService.getKycList({
            page,
            limit: 15,
            search,
            status: statusFilter,
          });
          if (res.success && res.data) {
            setKycList(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        } else if (activeTab === 'escrows') {
          const res = await adminService.getEscrows({
            page,
            limit: 15,
            search,
            status: statusFilter,
          });
          if (res.success && res.data) {
            setEscrows(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        } else if (activeTab === 'disputes') {
          const res = await adminService.getDisputes({
            page,
            limit: 15,
            status: statusFilter,
          });
          if (res.success && res.data) {
            setDisputes(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        } else if (activeTab === 'withdrawals') {
          const res = await adminService.getWithdrawals({
            page,
            limit: 15,
            search,
            status: statusFilter,
          });
          if (res.success && res.data) {
            setWithdrawals(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        } else if (activeTab === 'payments') {
          const res = await adminService.getPayments({
            page,
            limit: 15,
            search,
            status: statusFilter,
          });
          if (res.success && res.data) {
            setPayments(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        } else if (activeTab === 'audit-logs') {
          const res = await adminService.getAuditLogs({
            page,
            limit: 20,
            search,
            category: categoryFilter,
          });
          if (res.success && res.data) {
            setAuditLogs(res.data);
            setTotalPages(res.pagination?.totalPages || 1);
          }
        }
      } catch (err: any) {
        setErrorMsg('Failed to fetch records.');
      } finally {
        setDataLoading(false);
      }
    };

    loadTabData();
  }, [activeTab, page, search, statusFilter, roleFilter, categoryFilter, isAuthorized]);

  // Reset pagination when switching tabs
  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setPage(1);
    setSearch('');
    setStatusFilter('');
    setRoleFilter('');
    setCategoryFilter('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  // Actions
  const handleViewUser = async (userId: string) => {
    try {
      const res = await adminService.getUserById(userId);
      if (res.success && res.data) {
        setSelectedUserDetail(res.data);
      } else {
        setErrorMsg(res.error || 'Could not load user details.');
      }
    } catch {
      setErrorMsg('Failed to load user details.');
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusModalUser) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await adminService.updateUserStatus(statusModalUser.id, newStatus);
      if (res.success) {
        setSuccessMsg(`User status set to ${newStatus}.`);
        setStatusModalUser(null);
        // Refresh list & stats
        fetchStats();
        const updated = await adminService.getUsers({ page, limit: 15, search, account_status: statusFilter, role: roleFilter });
        if (updated.data) setUsers(updated.data);
      } else {
        setErrorMsg(res.error || 'Failed to update user status.');
      }
    } catch {
      setErrorMsg('Failed to update status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!roleModalUser) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await adminService.updateUserRole(roleModalUser.id, newRole);
      if (res.success) {
        setSuccessMsg(`User role updated to ${newRole}.`);
        setRoleModalUser(null);
        fetchStats();
        const updated = await adminService.getUsers({ page, limit: 15, search, account_status: statusFilter, role: roleFilter });
        if (updated.data) setUsers(updated.data);
      } else {
        setErrorMsg(res.error || 'Failed to update user role.');
      }
    } catch {
      setErrorMsg('Failed to update user role.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveKyc = async (userId: string) => {
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await adminService.approveKyc(userId);
      if (res.success) {
        setSuccessMsg('KYC approved successfully.');
        fetchStats();
        const updated = await adminService.getKycList({ page, limit: 15, search, status: statusFilter });
        if (updated.data) setKycList(updated.data);
      } else {
        setErrorMsg(res.error || 'KYC approval failed.');
      }
    } catch {
      setErrorMsg('KYC approval failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectKyc = async () => {
    if (!rejectKycUserId || !rejectReason.trim()) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await adminService.rejectKyc(rejectKycUserId, rejectReason.trim());
      if (res.success) {
        setSuccessMsg('KYC rejected successfully.');
        setRejectKycUserId(null);
        setRejectReason('');
        fetchStats();
        const updated = await adminService.getKycList({ page, limit: 15, search, status: statusFilter });
        if (updated.data) setKycList(updated.data);
      } else {
        setErrorMsg(res.error || 'KYC rejection failed.');
      }
    } catch {
      setErrorMsg('KYC rejection failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!resolveDisputeItem) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      let bAmt: number | undefined;
      let sAmt: number | undefined;

      if (resolutionType === 'split') {
        bAmt = parseFloat(splitBuyerAmount);
        sAmt = parseFloat(splitSellerAmount);
        if (isNaN(bAmt) || isNaN(sAmt)) {
          setErrorMsg('Please enter valid numerical split amounts.');
          setActionLoading(false);
          return;
        }
        if (Math.abs(bAmt + sAmt - resolveDisputeItem.escrowAmount) > 0.01) {
          setErrorMsg(
            `Split total (₦${bAmt + sAmt}) must equal total escrow amount (₦${resolveDisputeItem.escrowAmount}).`
          );
          setActionLoading(false);
          return;
        }
      }

      const res = await adminService.resolveDispute(resolveDisputeItem.escrowId, {
        resolution: resolutionType,
        buyerAmount: bAmt,
        sellerAmount: sAmt,
        resolutionNotes,
      });

      if (res.success) {
        setSuccessMsg('Dispute resolved successfully.');
        setResolveDisputeItem(null);
        setResolutionNotes('');
        setSplitBuyerAmount('');
        setSplitSellerAmount('');
        fetchStats();
        const updated = await adminService.getDisputes({ page, limit: 15, status: statusFilter });
        if (updated.data) setDisputes(updated.data);
      } else {
        setErrorMsg(res.error || 'Dispute resolution failed.');
      }
    } catch {
      setErrorMsg('Dispute resolution failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 bg-[#0B0F17]">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 text-red-400">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Access Restricted</h1>
        <p className="text-slate-400 max-w-md text-sm mb-6">
          You do not possess the required administrator or moderator credentials to access the Control Center.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-[#111622] border-r border-slate-800 p-4 shrink-0">
        <div className="flex items-center space-x-3 px-3 py-4 border-b border-slate-800/80 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100 text-sm tracking-wide">ADMIN CENTER</h2>
            <p className="text-xs text-emerald-400 font-mono capitalize">{user?.role} Portal</p>
          </div>
        </div>

        <nav className="space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, count: null },
            { id: 'users', label: 'User Management', icon: Users, count: stats?.totalUsers },
            { id: 'kyc', label: 'KYC Moderation', icon: ShieldCheck, count: stats?.pendingKyc },
            { id: 'escrows', label: 'Escrow Monitoring', icon: Briefcase, count: stats?.activeEscrows },
            { id: 'disputes', label: 'Dispute Center', icon: Scale, count: stats?.openDisputes },
            { id: 'withdrawals', label: 'Withdrawal Watch', icon: ArrowUpRight, count: stats?.pendingWithdrawals },
            { id: 'payments', label: 'Payment Ledger', icon: CreditCard, count: null },
            { id: 'audit-logs', label: 'Audit Trail', icon: FileText, count: null },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id as AdminTab)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.count !== null && item.count !== undefined && item.count > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isActive ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
        {/* Banner Messages */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center space-x-3 text-red-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-200">
              &times;
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-3 text-emerald-300 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="flex-1">{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-200">
              &times;
            </button>
          </div>
        )}

        {/* 1. DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-100">System Overview</h1>
                <p className="text-xs text-slate-400 mt-1">Real-time PostgreSQL statistics & financial metrics</p>
              </div>
              <button
                onClick={fetchStats}
                disabled={statsLoading}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Stats</span>
              </button>
            </div>

            {/* Metrics Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#111622] border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Total Registered Users</p>
                <p className="text-2xl font-bold text-slate-100 mt-2 font-mono">
                  {statsLoading ? '...' : stats?.totalUsers.toLocaleString()}
                </p>
                <div className="flex items-center space-x-2 mt-2 text-[11px] text-slate-400">
                  <span className="text-emerald-400 font-semibold">{stats?.verifiedUsers} Verified</span>
                  <span>•</span>
                  <span className="text-amber-400">{stats?.pendingKyc} Pending KYC</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#111622] border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Locked Escrow Funds</p>
                <p className="text-2xl font-bold text-emerald-400 mt-2 font-mono tabular-nums">
                  {statsLoading ? '...' : formatNaira(stats?.totalLockedEscrow || 0)}
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  {stats?.activeEscrows} Active Deals | {stats?.openDisputes} Open Disputes
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#111622] border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Total Wallet Balances</p>
                <p className="text-2xl font-bold text-blue-400 mt-2 font-mono tabular-nums">
                  {statsLoading ? '...' : formatNaira(stats?.totalWalletBalances || 0)}
                </p>
                <p className="text-[11px] text-slate-400 mt-2">Combined user available liquidity</p>
              </div>

              <div className="p-4 rounded-xl bg-[#111622] border border-slate-800/80">
                <p className="text-xs text-slate-400 font-medium">Pending Withdrawals</p>
                <p className="text-2xl font-bold text-amber-400 mt-2 font-mono">
                  {statsLoading ? '...' : stats?.pendingWithdrawals}
                </p>
                <p className="text-[11px] text-slate-400 mt-2">Awaiting banking settlement</p>
              </div>
            </div>

            {/* Quick Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-[#111622] border border-slate-800/80 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Escrow Distribution</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Active Deals:</span>
                    <span className="font-mono text-emerald-400 font-semibold">{stats?.activeEscrows}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Completed Deals:</span>
                    <span className="font-mono text-blue-400">{stats?.completedEscrows}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Disputed Deals:</span>
                    <span className="font-mono text-red-400 font-semibold">{stats?.disputedEscrows}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#111622] border border-slate-800/80 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">User Risk Status</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Suspended Users:</span>
                    <span className="font-mono text-red-400 font-semibold">{stats?.suspendedUsers}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Pending Identity Checks:</span>
                    <span className="font-mono text-amber-400">{stats?.pendingKyc}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Fully Verified:</span>
                    <span className="font-mono text-emerald-400">{stats?.verifiedUsers}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#111622] border border-slate-800/80 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Payment Ledger</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Successful Deposits:</span>
                    <span className="font-mono text-emerald-400">{stats?.successfulDeposits}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Failed Deposits:</span>
                    <span className="font-mono text-red-400">{stats?.failedPayments}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Pending Payouts:</span>
                    <span className="font-mono text-amber-400">{stats?.pendingWithdrawals}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. USER MANAGEMENT TAB */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-100">User Management</h1>
                <p className="text-xs text-slate-400">View, inspect, manage roles, and moderate user account statuses</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search name/email..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 bg-[#111622] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#111622] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>

                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#111622] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="">All Roles</option>
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Account Status</th>
                    <th className="px-4 py-3">KYC Status</th>
                    <th className="px-4 py-3">Registered</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        Loading users...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No user accounts match query.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-100">{u.fullName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              u.role === 'admin'
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                : u.role === 'moderator'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              u.accountStatus === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : u.accountStatus === 'suspended'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {u.accountStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] capitalize ${
                              u.kycStatus === 'verified'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : u.kycStatus === 'pending'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {u.kycStatus} (Tier {u.kycTier})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            onClick={() => handleViewUser(u.id)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => {
                              setStatusModalUser(u);
                              setNewStatus(u.accountStatus === 'suspended' ? 'active' : 'suspended');
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-medium border border-slate-700 transition"
                          >
                            Status
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => {
                                setRoleModalUser(u);
                                setNewRole((u.role as any) || 'user');
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-400 text-[11px] font-medium border border-slate-700 transition"
                            >
                              Role
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. KYC MODERATION TAB */}
        {activeTab === 'kyc' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-100">KYC Verification Moderation</h1>
                <p className="text-xs text-slate-400">Review pending identity submissions and manage verification status</p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#111622] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                >
                  <option value="">All KYC Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                  <option value="unverified">Unverified</option>
                </select>
              </div>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Applicant</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submission Date</th>
                    <th className="px-4 py-3 text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500">
                        Loading KYC records...
                      </td>
                    </tr>
                  ) : kycList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500">
                        No KYC records found.
                      </td>
                    </tr>
                  ) : (
                    kycList.map((k) => (
                      <tr key={k.userId} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-100">{k.fullName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{k.email}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                          {k.phoneNumber || 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              k.kycStatus === 'verified'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : k.kycStatus === 'pending'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : k.kycStatus === 'rejected'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {k.kycStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(k.submissionDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            disabled={actionLoading || k.kycStatus === 'verified'}
                            onClick={() => handleApproveKyc(k.userId)}
                            className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/30 disabled:opacity-30 transition"
                          >
                            Approve
                          </button>
                          <button
                            disabled={actionLoading || k.kycStatus === 'rejected'}
                            onClick={() => setRejectKycUserId(k.userId)}
                            className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium border border-red-500/30 disabled:opacity-30 transition"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. ESCROWS TAB */}
        {activeTab === 'escrows' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-100">Escrow Deal Inspector</h1>
                <p className="text-xs text-slate-400">Monitor all buyer and seller deals, locked amounts, and completion stages</p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#111622] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="awaiting_payment">Awaiting Payment</option>
                  <option value="funded">Funded</option>
                  <option value="delivered">Delivered</option>
                  <option value="disputed">Disputed</option>
                  <option value="completed">Completed</option>
                  <option value="refunded">Refunded</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Escrow ID / Title</th>
                    <th className="px-4 py-3">Buyer</th>
                    <th className="px-4 py-3">Seller</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        Loading escrow deals...
                      </td>
                    </tr>
                  ) : escrows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No escrow deals found.
                      </td>
                    </tr>
                  ) : (
                    escrows.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-100">{e.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{e.id}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                          {e.buyerEmail}
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                          {e.sellerEmail || 'Unassigned'}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-400 tabular-nums">
                          {formatNaira(e.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              e.status === 'completed'
                                ? 'bg-blue-500/15 text-blue-400'
                                : e.status === 'funded' || e.status === 'in_escrow'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : e.status === 'disputed'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(e.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. DISPUTES TAB */}
        {activeTab === 'disputes' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-100">Dispute Arbitration Center</h1>
                <p className="text-xs text-slate-400">Arbitrate buyer-seller disputes using Phase 8 transaction-safe settlement</p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#111622] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                >
                  <option value="">All Dispute Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="resolved_buyer">Resolved (Buyer)</option>
                  <option value="resolved_seller">Resolved (Seller)</option>
                  <option value="resolved_split">Resolved (Split)</option>
                </select>
              </div>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Dispute ID</th>
                    <th className="px-4 py-3">Escrow Title</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Raised By</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Arbitration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        Loading disputes...
                      </td>
                    </tr>
                  ) : disputes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        No dispute records found.
                      </td>
                    </tr>
                  ) : (
                    disputes.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{d.id}</td>
                        <td className="px-4 py-3 font-semibold text-slate-100">{d.escrowTitle}</td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-400 tabular-nums">
                          {formatNaira(d.escrowAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200">{d.raisedByName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{d.raisedByEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-xs truncate">{d.reason}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              d.status === 'pending' || d.status === 'open'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setResolveDisputeItem(d);
                              setResolutionType('refund_buyer');
                              setSplitBuyerAmount(String(d.escrowAmount / 2));
                              setSplitSellerAmount(String(d.escrowAmount / 2));
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/30 transition"
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. WITHDRAWALS TAB */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-slate-100">Withdrawal Watch</h1>
              <p className="text-xs text-slate-400">Monitor bank payout transfers and masked account destination details</p>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Destination Bank</th>
                    <th className="px-4 py-3">Masked Account</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        Loading withdrawals...
                      </td>
                    </tr>
                  ) : withdrawals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        No withdrawal requests found.
                      </td>
                    </tr>
                  ) : (
                    withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-300">{w.reference}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100">{w.userName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{w.userEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{w.bankName}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{w.maskedAccountNumber}</td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-100 tabular-nums">
                          {formatNaira(w.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              w.status === 'completed' || w.status === 'successful'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : w.status === 'pending'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {w.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(w.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-slate-100">Payment Ledger</h1>
              <p className="text-xs text-slate-400">Read-only log of provider deposits and funding webhooks</p>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        Loading payment ledger...
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        No payment records found.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-300">{p.reference}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100">{p.userName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.userEmail}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-400 tabular-nums">
                          {formatNaira(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-300 uppercase font-mono text-[10px]">{p.provider}</td>
                        <td className="px-4 py-3 text-slate-400 capitalize">{p.paymentMethod || 'Card/Transfer'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              p.status === 'successful' || p.status === 'completed'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : p.status === 'pending'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. AUDIT LOGS TAB */}
        {activeTab === 'audit-logs' && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-slate-100">Administrative Audit Trail</h1>
              <p className="text-xs text-slate-400">Immutable log of moderation, status changes, and arbitration actions</p>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500">
                        Loading audit logs...
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500">
                        No audit log entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(l.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-200">{l.actorName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{l.actorEmail}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-emerald-400">{l.action}</td>
                        <td className="px-4 py-3 text-slate-400 capitalize">{l.category}</td>
                        <td className="px-4 py-3 text-slate-300 max-w-md">{l.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* USER DETAIL INSPECTOR MODAL */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">User Profile Inspection</h3>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="text-slate-400 hover:text-slate-200 text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Full Name</p>
                  <p className="font-bold text-slate-100 mt-0.5">{selectedUserDetail.fullName}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Email Address</p>
                  <p className="font-mono text-slate-200 mt-0.5">{selectedUserDetail.email}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">Phone Number</p>
                  <p className="font-mono text-slate-200 mt-0.5">{selectedUserDetail.phoneNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-semibold">System Role</p>
                  <p className="font-mono text-purple-400 font-bold uppercase mt-0.5">{selectedUserDetail.role}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div>
                  <p className="text-slate-400 text-[10px] uppercase">Available</p>
                  <p className="font-mono font-bold text-emerald-400 mt-0.5">
                    {formatNaira(selectedUserDetail.wallet.availableBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase">In Escrow</p>
                  <p className="font-mono font-bold text-amber-400 mt-0.5">
                    {formatNaira(selectedUserDetail.wallet.escrowBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase">Active Deals</p>
                  <p className="font-mono font-bold text-slate-200 mt-0.5">{selectedUserDetail.activeEscrowCount}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT STATUS MODAL */}
      {statusModalUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 text-slate-200">
            <h3 className="text-base font-bold text-slate-100">Update Account Status</h3>
            <p className="text-xs text-slate-400">
              Set status for <span className="text-slate-200 font-semibold">{statusModalUser.fullName}</span> ({statusModalUser.email})
            </p>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium">Select Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
              >
                <option value="active">Active (Full Platform Access)</option>
                <option value="suspended">Suspended (Blocked from APIs)</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setStatusModalUser(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleUpdateStatus}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition"
              >
                {actionLoading ? 'Updating...' : 'Save Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE MODAL */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 text-slate-200">
            <h3 className="text-base font-bold text-slate-100">Update User System Role</h3>
            <p className="text-xs text-slate-400">
              Modify system privileges for <span className="text-slate-200 font-semibold">{roleModalUser.fullName}</span>
            </p>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium">Select Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
              >
                <option value="user">User (Standard Marketplace Access)</option>
                <option value="moderator">Moderator (Disputes & KYC Access)</option>
                <option value="admin">Admin (Full Control Privilege)</option>
              </select>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setRoleModalUser(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleUpdateRole}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition"
              >
                {actionLoading ? 'Saving...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC REJECT REASON MODAL */}
      {rejectKycUserId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 text-slate-200">
            <h3 className="text-base font-bold text-slate-100">Reject KYC Submission</h3>
            <p className="text-xs text-slate-400">Provide a clear rejection reason sent to the user notification feed.</p>

            <textarea
              rows={3}
              placeholder="e.g. Document image blurry or mismatching full name..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500/50"
            />

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setRejectKycUserId(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || !rejectReason.trim()}
                onClick={handleRejectKyc}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition"
              >
                {actionLoading ? 'Rejecting...' : 'Reject Application'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPUTE RESOLUTION MODAL */}
      {resolveDisputeItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111622] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-slate-200">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Dispute Arbitration Resolution</h3>
              <p className="text-xs text-slate-400 mt-1">
                Escrow Amount: <span className="font-mono font-bold text-emerald-400">{formatNaira(resolveDisputeItem.escrowAmount)}</span>
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Resolution Strategy</label>
                <select
                  value={resolutionType}
                  onChange={(e) => setResolutionType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
                >
                  <option value="refund_buyer">Refund Buyer (100% to Buyer Wallet)</option>
                  <option value="release_to_seller">Pay Seller (100% to Seller Wallet)</option>
                  <option value="split">Split Settlement (Custom Distribution)</option>
                </select>
              </div>

              {resolutionType === 'split' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Buyer Amount (₦)</label>
                    <input
                      type="number"
                      value={splitBuyerAmount}
                      onChange={(e) => setSplitBuyerAmount(e.target.value)}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase font-semibold block mb-1">Seller Amount (₦)</label>
                    <input
                      type="number"
                      value={splitSellerAmount}
                      onChange={(e) => setSplitSellerAmount(e.target.value)}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-blue-400"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-slate-300 font-medium block mb-1">Resolution Notes</label>
                <textarea
                  rows={2}
                  placeholder="Official arbitration ruling details..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setResolveDisputeItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleResolveDispute}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold rounded-xl transition"
              >
                {actionLoading ? 'Executing...' : 'Execute Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
