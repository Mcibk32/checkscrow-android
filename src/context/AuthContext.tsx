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
  /** True while a CHECKSCROW email/password session is active (not Clerk). */
  hasSessionToken: boolean;
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
  refetchUserWithTimeout?: (timeoutMs?: number) => Promise<boolean>;
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

const friendlyAuthError = (error?: string, code?: string): string => {
  if (code === 'EMAIL_ALREADY_EXISTS') {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (code === 'NETWORK_ERROR') {
    return 'Unable to reach CHECKSCROW. Please check your internet connection and try again.';
  }
  if (code === 'UNAUTHORIZED' || code === 'INVALID_TOKEN') {
    return error || 'Incorrect email address or password. Please try again.';
  }
  return error || 'Something went wrong. Please try again.';
};

/**
 * CHECKSCROW email/password session handling shared by both providers: it talks
 * only to the CHECKSCROW API (POST /auth/login, POST /auth/register,
 * GET /auth/me) and owns the persisted session token.
 */
function useCheckscrowSession() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuestExplorer, setIsGuestExplorer] = useState<boolean>(false);
  const [hasSessionToken, setHasSessionToken] = useState<boolean>(() => api.hasSessionToken());

  const fetchCurrentUser = useCallback(async (): Promise<boolean> => {
    console.log('[AUTH] GET /auth/me requested');
    const res = await authService.getCurrentUser();
    if (res.success && res.data) {
      console.log(`[AUTH] /auth/me resolved user id=${res.data.id} role=${res.data.role}`);
      setUser(res.data);
      setIsGuestExplorer(false);
      return true;
    }
    console.warn(`[AUTH] /auth/me failed code=${res.code || '(none)'} status=${res.status ?? '(none)'}`);
    return false;
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.login(payload);
      if (!res.success || !res.data) {
        setError(friendlyAuthError(res.error, res.code));
        setHasSessionToken(api.hasSessionToken());
        return false;
      }

      // The login payload already contains the account, so the dashboard is
      // populated even if the follow-up /auth/me call cannot be served.
      setUser(res.data.user);
      setIsGuestExplorer(false);
      setHasSessionToken(api.hasSessionToken());

      if (!res.data.token) {
        console.warn('[SESSION] login succeeded but no session token was returned; authenticated requests will fail');
      } else {
        await fetchCurrentUser();
      }
      return true;
    } catch (err: any) {
      console.error('[AUTH] login threw:', err?.message || err);
      setError('Unable to reach CHECKSCROW. Please check your internet connection and try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const register = useCallback(async (payload: RegisterPayload): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.register(payload);
      if (!res.success || !res.data) {
        setError(friendlyAuthError(res.error, res.code));
        setHasSessionToken(api.hasSessionToken());
        return false;
      }
      setUser(res.data.user);
      setIsGuestExplorer(false);
      setHasSessionToken(api.hasSessionToken());
      if (res.data.token) {
        await fetchCurrentUser();
      }
      return true;
    } catch (err: any) {
      console.error('[AUTH] register threw:', err?.message || err);
      setError('Unable to reach CHECKSCROW. Please check your internet connection and try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const clearSession = useCallback(() => {
    api.setToken(null);
    setHasSessionToken(false);
    setUser(null);
    setIsGuestExplorer(false);
  }, []);

  return {
    user,
    setUser,
    isLoading,
    setIsLoading,
    error,
    setError,
    isGuestExplorer,
    setIsGuestExplorer,
    hasSessionToken,
    setHasSessionToken,
    fetchCurrentUser,
    login,
    register,
    clearSession,
  };
}

// Internal component that hooks into Clerk context when ClerkProvider is active
const ClerkAuthBridge: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const { signOut } = useClerk();

  const {
    user,
    setUser,
    isLoading,
    setIsLoading,
    error,
    setError,
    isGuestExplorer,
    setIsGuestExplorer,
    hasSessionToken,
    setHasSessionToken,
    fetchCurrentUser,
    login,
    register,
    clearSession,
  } = useCheckscrowSession();

  // Watchdog: if Clerk never reports `isLoaded` (e.g. the production instance
  // rejects the Capacitor WebView origin, or the device has no network path
  // to Clerk's Frontend API), we give up after CLERK_LOAD_TIMEOUT_MS and fall
  // back to the local/backend auth UI instead of spinning forever.
  const [clerkTimedOut, setClerkTimedOut] = useState<boolean>(false);
  const clerkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRestoreAttempted = useRef<boolean>(false);

  useEffect(() => {
    if (isLoaded) {
      if (clerkTimeoutRef.current) {
        clearTimeout(clerkTimeoutRef.current);
        clerkTimeoutRef.current = null;
      }
      return;
    }

    clerkTimeoutRef.current = setTimeout(() => {
      console.warn(`[CLERK] did not finish loading within ${CLERK_LOAD_TIMEOUT_MS}ms; falling back to local auth UI.`);
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

  // Restore an existing CHECKSCROW email/password session immediately, without
  // waiting for (or depending on) Clerk. Clerk owns Google identities only.
  useEffect(() => {
    if (sessionRestoreAttempted.current) return;
    sessionRestoreAttempted.current = true;

    if (!api.hasSessionToken()) {
      console.log('[SESSION] no stored CHECKSCROW session token to restore');
      return;
    }

    console.log('[SESSION] stored CHECKSCROW session token found - restoring profile');
    setIsLoading(true);
    (async () => {
      const restored = await fetchCurrentUser();
      if (!restored) {
        console.warn('[SESSION] stored session token rejected by /auth/me - clearing it');
        clearSession();
      }
      setHasSessionToken(api.hasSessionToken());
      setIsLoading(false);
    })();
  }, [fetchCurrentUser, clearSession, setHasSessionToken, setIsLoading]);

  const getTokenWithRetries = useCallback(async (
    getTokenFn: () => Promise<string | null>,
    delays = [0, 250, 500, 1000]
  ): Promise<string | null> => {
    for (const delay of delays) {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        const token = await getTokenFn();
        if (token) {
          return token;
        }
      } catch (err: any) {
        console.warn('[CLERK] getToken attempt failed:', err?.message || err);
      }
    }

    return null;
  }, []);

  /**
   * Resolves the CHECKSCROW account behind the current Clerk identity. If the
   * account has not been linked yet, POST /auth/sync-login asks the server to
   * verify the Clerk token and link (or create) the account, then /auth/me is
   * retried. The server remains the only place where a Clerk token is trusted.
   */
  const resolveClerkAccount = useCallback(async (): Promise<boolean> => {
    if (await fetchCurrentUser()) return true;

    console.log('[CLERK] /auth/me did not resolve an account - attempting account link via /auth/sync-login');
    const sync = await authService.syncClerkSession();
    console.log(`[CLERK] /auth/sync-login success=${sync.success} code=${sync.code || '(none)'} status=${sync.status ?? '(none)'}`);
    if (!sync.success) {
      setError(friendlyAuthError(sync.error, sync.code));
      return false;
    }

    const linked = await fetchCurrentUser();
    if (!linked) {
      setError('Google sign-in succeeded but your CHECKSCROW profile could not be loaded. Please try again.');
    }
    return linked;
  }, [fetchCurrentUser, setError]);

  useEffect(() => {
    if (!isLoaded) {
      if (clerkTimedOut) {
        // Clerk gave up initializing - stop blocking the UI. The CHECKSCROW
        // session token is deliberately left intact: it does not belong to
        // Clerk and is still valid for the API.
        api.setTokenGetter(null);
        setIsLoading(false);
      }
      return;
    }

    if (!isSignedIn) {
      console.log('[CLERK] isSignedIn=false - removing Clerk token getter (CHECKSCROW session left untouched)');
      api.setTokenGetter(null);
      if (!api.hasSessionToken()) {
        setUser(null);
      }
      setIsLoading(false);
      return;
    }

    if (api.hasSessionToken()) {
      // An explicit CHECKSCROW email/password session takes precedence.
      console.log('[CLERK] Clerk session present but a CHECKSCROW session token is active - keeping the CHECKSCROW session');
      api.setTokenGetter(null);
      setIsLoading(false);
      return;
    }

    console.log('[CLERK] isSignedIn=true - obtaining session token and syncing with the CHECKSCROW API');
    setIsLoading(true);

    (async () => {
      const token = await getTokenWithRetries(getToken);
      console.log(`[CLERK] session token available=${!!token} length=${token ? token.length : 0}`);

      if (!token) {
        console.warn('[CLERK] signed in but no session token could be obtained');
        api.setTokenGetter(null);
        setUser(null);
        setError('Google sign-in could not be completed because no session token was issued. Please try again.');
        setIsLoading(false);
        return;
      }

      // Clerk tokens are short lived, so the getter (never a cached copy) is
      // what every authenticated request uses.
      api.setTokenGetter(async () => await getTokenWithRetries(getToken));

      const success = await resolveClerkAccount();
      console.log(`[CLERK] authentication bootstrap complete success=${success}`);
      setIsLoading(false);
    })();
  }, [
    isLoaded,
    clerkTimedOut,
    isSignedIn,
    clerkUser,
    getToken,
    getTokenWithRetries,
    resolveClerkAccount,
    setUser,
    setError,
    setIsLoading,
  ]);

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOut();
    } catch (e) {
      console.warn('[CLERK] signOut error:', e);
    }
    try {
      await authService.logout();
    } catch {}
    api.setTokenGetter(null);
    clearSession();
    setIsLoading(false);
  };

  const isRealUser = !!user && !isGuestExplorer;
  const kycBadge = getKycBadgeInfo(user, !isRealUser);
  const displayName = isRealUser ? (user.fullName || clerkUser?.fullName || 'CHECKSCROW User') : 'Guest Explorer';

  const refetchUser = async (): Promise<void> => {
    await fetchCurrentUser();
  };

  const refetchUserWithTimeout = async (timeoutMs = 8000): Promise<boolean> => {
    const withTimeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([fetchCurrentUser(), withTimeout]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        hasSessionToken,
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
        clearError: () => setError(null),
        setGuestExplorer: setIsGuestExplorer,
        refetchUser,
        refetchUserWithTimeout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Fallback provider when Clerk Publishable Key is not configured
const LocalAuthFallback: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    user,
    isLoading,
    setIsLoading,
    error,
    setError,
    isGuestExplorer,
    setIsGuestExplorer,
    hasSessionToken,
    setHasSessionToken,
    fetchCurrentUser,
    login,
    register,
    clearSession,
  } = useCheckscrowSession();

  const bootstrapped = useRef<boolean>(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    if (!api.hasSessionToken()) {
      setIsLoading(false);
      return;
    }

    (async () => {
      const restored = await fetchCurrentUser();
      if (!restored) {
        clearSession();
      }
      setHasSessionToken(api.hasSessionToken());
      setIsLoading(false);
    })();
  }, [fetchCurrentUser, clearSession, setHasSessionToken, setIsLoading]);

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authService.logout();
    } catch (e) {
      console.error('[AUTH] logout failed:', e);
    } finally {
      clearSession();
      setIsLoading(false);
    }
  };

  const isRealUser = !!user && !isGuestExplorer;
  const kycBadge = getKycBadgeInfo(user, !isRealUser);
  const displayName = isRealUser ? user.fullName : 'Guest Explorer';

  const refetchUser = async (): Promise<void> => {
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        hasSessionToken,
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
        clearError: () => setError(null),
        setGuestExplorer: setIsGuestExplorer,
        refetchUser,
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
