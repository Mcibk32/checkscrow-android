import React, { Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CLERK_PUBLISHABLE_KEY, isClerkDomainAllowed } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { EscrowPage } from './pages/EscrowPage';
import { WalletPage } from './pages/WalletPage';
import { ActivityPage } from './pages/ActivityPage';
import { ProfilePage } from './pages/ProfilePage';
import { KycPage } from './pages/KycPage';
import { PaymentCheckoutPage } from './pages/PaymentCheckoutPage';
import { AdminPage } from './pages/AdminPage';

// Protected Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isGuestExplorer, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium">Verifying CHECKSCROW session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isGuestExplorer) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
};

// Auth Route Guard (Redirect away from login/register if already logged in)
const PublicAuthRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#E2E8F0] flex flex-col justify-center py-6 sm:py-12 sm:px-6 lg:px-8 px-4 selection:bg-emerald-500/30 selection:text-emerald-200">
      {children}
    </div>
  );
};

// Root Path Handler
const RootHandler: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

export function App() {
  const content = (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Root Route */}
          <Route path="/" element={<RootHandler />} />

          {/* Public Auth Routes */}
          <Route
            path="/login/*"
            element={
              <PublicAuthRoute>
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                  <LoginPage />
                </div>
              </PublicAuthRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicAuthRoute>
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                  <LoginPage />
                </div>
              </PublicAuthRoute>
            }
          />
          <Route
            path="/register/*"
            element={
              <PublicAuthRoute>
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                  <RegisterPage />
                </div>
              </PublicAuthRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicAuthRoute>
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                  <RegisterPage />
                </div>
              </PublicAuthRoute>
            }
          />

          {/* Protected Application Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/escrow"
            element={
              <ProtectedRoute>
                <EscrowPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <WalletPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity"
            element={
              <ProtectedRoute>
                <ActivityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute>
                <KycPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/payment/checkout"
            element={<PaymentCheckoutPage />}
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );

  if (isClerkDomainAllowed() && CLERK_PUBLISHABLE_KEY) {
    return (
      <ClerkErrorBoundary fallback={content}>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
          {content}
        </ClerkProvider>
      </ClerkErrorBoundary>
    );
  }

  return content;
}

interface ClerkErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface ClerkErrorBoundaryState {
  hasError: boolean;
}

class ClerkErrorBoundary extends Component<ClerkErrorBoundaryProps, ClerkErrorBoundaryState> {
  override state: ClerkErrorBoundaryState = { hasError: false };

  constructor(props: ClerkErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('Clerk initialization fallback triggered:', error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default App;
