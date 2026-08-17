import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { useAuth as useClerkAuth, useUser as useClerkUser, useClerk } from '@clerk/clerk-react';
import { Capacitor } from '@capacitor/core';
import { UserProfile } from '../types';
import { authService, LoginPayload, RegisterPayload } from '../services/authService';
import { api } from '../services/api';

// Maximum time (ms) we will wait for Clerk to finish bootstrapping before we
// give up and fall back to the local/backend auth UI. This guarantees the
// app can NEVER be stuck on the loading screen indefinitely, even if Clerk's
// Frontend API is unreachable or rejects the Capacitor WebView origin.
const CLERK_LOAD_TIMEOUT_MS = 6000;

export interface KycBadgeInfo {
  label: string;
  shortLabel: string;
  variant: 'success' | 'warning' | 'danger' | 'neutral';
  isVerified: boolean;
}

export function getKycBadgeInfo(user: UserProfile | null, isGuest: boolean): KycBadgeInfo {
  if (!user || isGuest) {
    return {
      label: 'Guest Explorer',
      shortLabel: 'Guest',
      variant: 'neutral',
      isVerified: false,
    };
  }

  const tier = user.kycTier || 1;
  const status = user.kycStatus || 'unverified';

  if (status === 'verified') {
    return {
      label: `Verified Tier ${tier}`,
      shortLabel: `Verified T${tier}`,
      variant: 'success',
      isVerified: true,
    };
  }
  if (status === 'pending') {
    return {
      label: 'KYC Review Pending',
      shortLabel: 'Pending',
      variant: 'warning',
      isVerified: false,
    };
  }
  if (status === 'rejected') {
    return {
      label: 'Verification Rejected',
      shortLabel: 'Rejected',
      variant: 'danger',
      isVerified: false,
    };
  }

  return {
    label: `Tier ${tier} Unverified`,
    shortLabel: `Tier ${tier}`,
    variant: 'neutral',
    isVerified: false,
  };
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isGuestExplorer: boolean;
  isLoading: boolean;
  error: string | null;
  kycBadge: KycBadgeInfo;
  displayName: string;
  isClerkConfigured: boolean;
  login: (payload: LoginPayload) => Promise<boolean>;
  register: (payload: RegisterPayload) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  setGuestExplorer: (val: boolean) => void;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const CLERK_PUBLISHABLE_KEY = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_CLERK_PUBLISHABLE_KEY || '';

export const isClerkDomainAllowed = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (!CLERK_PUBLISHABLE_KEY || CLERK_PUBLISHABLE_KEY.trim() === '') return false;
  
  // If using a test key (pk_test_), Clerk allows all domains (localhost, preview, etc.)
  if (CLERK_PUBLISHABLE_KEY.startsWith('pk_test_')) {
    return true;
  }

  // Native Capacitor apps (Android/iOS) never run under the real production
  // hostname, so `Capacitor.isNativePlatform()` is the only reliable signal
  // there. It does not depend on `androidScheme`/`hostname` config, unlike
  // sniffing `window.location`.
  try {
    if (Capacitor.isNativePlatform()) {
      return true;
    }
  } catch {
    // Capacitor not available (e.g. plain web bundle) - fall through to web checks.
  }

  // If using a live/production key (pk_live_), Clerk enforces origin match with checkscrow.com.ng
  try {
    const hostname = window.location.hostname.toLowerCase();
    const protocol = window.location.protocol.toLowerCase();
    return (
      hostname === 'checkscrow.com.ng' ||
      hostname.endsWith('.checkscrow.com.ng') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      protocol === 'capacitor:' ||
      protocol === 'ionic:' ||
      protocol === 'file:'
    );
  } catch {
    return false;
  }
};

// Internal component that hooks into Clerk context when ClerkProvider is active
const ClerkAuthBridge: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const { signOut } = useClerk();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuestExplorer, setIsGuestExplorer] = useState<boolean>(false);

  // Watchdog: if Clerk never reports `isLoaded` (e.g. the production instance
  // rejects the Capacitor WebView origin, or the device has no network path
  // to Clerk's Frontend API), we give up after CLERK_LOAD_TIMEOUT_MS and fall
  // back to the local/backend auth UI instead of spinning forever.
  const [clerkTimedOut, setClerkTimedOut] = useState<boolean>(false);
  const clerkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoaded) {
      if (clerkTimeoutRef.current) {
        clearTimeout(clerkTimeoutRef.current);
        clerkTimeoutRef.current = null;
      }
      return;
    }

    clerkTimeoutRef.current = setTimeout(() => {
      console.warn(`Clerk did not finish loading within ${CLERK_LOAD_TIMEOUT_MS}ms; falling back to local auth UI.`);
      setClerkTimedOut(true);
    }, CLERK_LOAD_TIMEOUT_MS);

    return () => {
      if (clerkTimeoutRef.current) {
        clearTimeout(clerkTimeoutRef.current);
        clerkTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const fetchPostgresUser = useCallback(async () => {
    // DIAGNOSTIC: confirms whether GET /api/auth/me was actually called and
    // what it returned, without logging the token itself.
    console.log('[Auth] Calling GET /api/auth/me to resolve/link the CHECKSCROW profile...');
    try {
      const res = await authService.getCurrentUser();
      if (res.success && res.data) {
        console.log(`[Auth] /api/auth/me resolved PostgreSQL user id=${res.data.id}`);
        setUser(res.data);
        setIsGuestExplorer(false);
      } else {
        console.warn(`[Auth] /api/auth/me did not resolve a user: ${res.error || '(no error message)'} code=${res.code || '(none)'}`);
        setUser(null);
      }
    } catch (err) {
      console.warn('Failed to sync PostgreSQL profile for Clerk user:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      if (clerkTimedOut) {
        // Clerk gave up initializing - stop blocking the UI and behave as
        // signed-out so the login/register screens render normally.
        api.setTokenGetter(null);
        api.setToken(null);
        setUser(null);
        setIsLoading(false);
      }
      return;
    }

    if (isSignedIn) {
      // DIAGNOSTIC: confirms Clerk itself reached a signed-in state (Google
      // or email/password) before we ever attempt to sync with the backend.
      console.log('[Auth] Clerk isSignedIn=true - registering token getter and syncing with backend.');
      setIsLoading(true);
      // Register token getter for automatic fresh Clerk session token on every API request
      api.setTokenGetter(async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      });

      fetchPostgresUser();
    } else {
      api.setTokenGetter(null);
      api.setToken(null);
      setUser(null);
      setIsLoading(false);
    }
  }, [isLoaded, clerkTimedOut, isSignedIn, clerkUser, getToken, fetchPostgresUser]);

  const login = async (payload: LoginPayload): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.login(payload);
      if (res.success && res.data) {
        setUser(res.data.user);
        setIsGuestExplorer(false);
        setIsLoading(false);
        return true;
      } else {
        setError(res.error || 'Login failed. Please check credentials.');
        setIsLoading(false);
        return false;
      }
    } catch {
      setError('An error occurred during login.');
      setIsLoading(false);
      return false;
    }
  };

  const register = async (payload: RegisterPayload): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.register(payload);
      if (res.success && res.data) {
        setUser(res.data.user);
        setIsGuestExplorer(false);
        setIsLoading(false);
        return true;
      } else {
        setError(res.error || 'Registration failed.');
        setIsLoading(false);
        return false;
      }
    } catch {
      setError('An error occurred during registration.');
      setIsLoading(false);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOut();
    } catch (e) {
      console.warn('Clerk signOut error:', e);
    }
    try {
      await authService.logout();
    } catch {}
    api.setTokenGetter(null);
    api.setToken(null);
    setUser(null);
    setIsGuestExplorer(false);
    setIsLoading(false);
  };

  const clearError = () => setError(null);
  const isRealUser = !!user && !isGuestExplorer;
  const kycBadge = getKycBadgeInfo(user, !isRealUser);
  const displayName = isRealUser ? (user.fullName || clerkUser?.fullName || 'CHECKSCROW User') : 'Guest Explorer';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: isRealUser,
        isGuestExplorer,
        // Never wait on Clerk past the watchdog timeout - once it fires we
        // treat initialization as finished (failed) rather than pending.
        isLoading: clerkTimedOut ? isLoading : (!isLoaded || isLoading),
        error,
        kycBadge,
        displayName,
        // If Clerk failed to initialize in time, present the app as if Clerk
        // isn't configured so the local/backend login & register forms are
        // used instead of the Clerk-powered ones.
        isClerkConfigured: !clerkTimedOut,
        login,
        register,
        logout,
        clearError,
        setGuestExplorer: setIsGuestExplorer,
        refetchUser: fetchPostgresUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Fallback provider when Clerk Publishable Key is not configured
const LocalAuthFallback: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuestExplorer, setIsGuestExplorer] = useState<boolean>(false);

  const fetchUser = useCallback(async () => {
    const token = api.getToken();
    if (token) {
      setIsLoading(true);
      try {
        const res = await authService.getCurrentUser();
        if (res.success && res.data) {
          setUser(res.data);
          setIsGuestExplorer(false);
        } else {
          api.setToken(null);
          setUser(null);
          setIsGuestExplorer(false);
        }
      } catch {
        api.setToken(null);
        setUser(null);
        setIsGuestExplorer(false);
      } finally {
        setIsLoading(false);
      }
    } else {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (payload: LoginPayload): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.login(payload);
      if (res.success && res.data) {
        setUser(res.data.user);
        setIsGuestExplorer(false);
        setIsLoading(false);
        return true;
      } else {
        setError(res.error || 'Login failed. Please check credentials.');
        setIsLoading(false);
        return false;
      }
    } catch {
      setError('An error occurred during login.');
      setIsLoading(false);
      return false;
    }
  };

  const register = async (payload: RegisterPayload): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.register(payload);
      if (res.success && res.data) {
        setUser(res.data.user);
        setIsGuestExplorer(false);
        setIsLoading(false);
        return true;
      } else {
        setError(res.error || 'Registration failed.');
        setIsLoading(false);
        return false;
      }
    } catch {
      setError('An error occurred during registration.');
      setIsLoading(false);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authService.logout();
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      api.setToken(null);
      setUser(null);
      setIsGuestExplorer(false);
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);
  const isRealUser = !!user && !isGuestExplorer;
  const kycBadge = getKycBadgeInfo(user, !isRealUser);
  const displayName = isRealUser ? user.fullName : 'Guest Explorer';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: isRealUser,
        isGuestExplorer,
        isLoading,
        error,
        kycBadge,
        displayName,
        isClerkConfigured: false,
        login,
        register,
        logout,
        clearError,
        setGuestExplorer: setIsGuestExplorer,
        refetchUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  if (isClerkDomainAllowed()) {
    return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
  }
  return <LocalAuthFallback>{children}</LocalAuthFallback>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

