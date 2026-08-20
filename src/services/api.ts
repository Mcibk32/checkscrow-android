import { Capacitor } from '@capacitor/core';
import { ApiResponse } from '../types';

// Configurable API base URL supporting production APK and same-origin web builds
const getBaseUrl = (): string => {
  const customApiBase = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ||
                        (import.meta as unknown as { env?: Record<string, string> }).env?.PRODUCTION_API_BASE_URL;
  if (customApiBase && typeof customApiBase === 'string' && customApiBase.trim() !== '') {
    const trimmed = customApiBase.trim().replace(/\/+$/, '');
    console.log(`[API] custom base provided: ${trimmed}`);
    return trimmed;
  }

  // When running inside the native Android/iOS Capacitor shell, always use an absolute production API URL.
  try {
    if (Capacitor.isNativePlatform()) {
      console.log('[API] running on native platform, using production API base');
      return 'https://www.checkscrow.com.ng/api';
    }
  } catch {
    // Capacitor not available (plain web bundle) - fall through to web checks.
  }

  // Legacy fallback for WebViews that do report a custom scheme/protocol.
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    if (protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'file:' || hostname === '') {
      console.log('[API] running in special webview protocol, using production API base');
      return 'https://www.checkscrow.com.ng/api';
    }
  }

  // In standard web deployment (and same-origin reverse proxy), default to /api
  return '/api';
};

const API_BASE_URL = getBaseUrl();

// DEVELOPMENT DIAGNOSTIC: Print the resolved base URL at module initialization.
// This is safe: it does not print tokens or secrets. Remove this before shipping.
console.log('[API DEBUG] Resolved API_BASE_URL =', API_BASE_URL);

const SESSION_TOKEN_KEY = 'checkscrow_auth_token';

export type TokenSource = 'session' | 'clerk' | 'none';

class ApiClient {
  /** CHECKSCROW session JWT issued by POST /auth/login or /auth/register. Persisted. */
  private sessionToken: string | null = null;
  /** Returns a freshly minted Clerk session token. Never persisted (Clerk tokens are short lived). */
  private tokenGetter: (() => Promise<string | null>) | null = null;

  constructor() {
    this.sessionToken = typeof window !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
    try {
      const isNative = (Capacitor as any)?.isNativePlatform ? Capacitor.isNativePlatform() : false;
      console.log(`[API] native=${isNative} base=${API_BASE_URL}`);
    } catch (e) {
      console.log('[API] initialization - unable to determine native/platform');
    }
  }

  public setTokenGetter(getter: (() => Promise<string | null>) | null) {
    this.tokenGetter = getter;
  }

  public setToken(token: string | null) {
    this.sessionToken = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }
    }
    console.log(`[SESSION] CHECKSCROW session token ${token ? `stored (length=${token.length})` : 'cleared'}`);
  }

  /**
   * A CHECKSCROW session token always wins over a Clerk token: it is the
   * credential the user explicitly signed in with, and it is long lived.
   * The Clerk getter is only consulted when there is no manual session, and
   * it is always asked for a fresh token rather than reusing a cached one.
   */
  public async getEffectiveToken(): Promise<{ token: string | null; source: TokenSource }> {
    const stored = this.getToken();
    if (stored) {
      return { token: stored, source: 'session' };
    }

    if (this.tokenGetter) {
      try {
        const freshToken = await this.tokenGetter();
        if (freshToken) return { token: freshToken, source: 'clerk' };
        console.warn('[CLERK] tokenGetter returned no token');
      } catch (err: any) {
        console.warn('[CLERK] tokenGetter threw an error while retrieving token:', err?.message || err);
      }
    }

    return { token: null, source: 'none' };
  }

  public getToken(): string | null {
    if (!this.sessionToken && typeof window !== 'undefined') {
      this.sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
    }
    return this.sessionToken;
  }

  public hasSessionToken(): boolean {
    return !!this.getToken();
  }

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const { token: currentToken, source } = await this.getEffectiveToken();
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    try {
      // DEVELOPMENT DIAGNOSTIC LOGGING (safe): method, full URL, token presence/length/prefix
      const method = (options.method || 'GET').toUpperCase();
      const tokenPresent = !!currentToken;
      const tokenLength = currentToken ? currentToken.length : 0;
      const tokenPrefix = currentToken ? currentToken.slice(0, 8) : null;

      console.log(`[API DEBUG] ${method} ${url} tokenSource=${source} tokenPresent=${tokenPresent} tokenLength=${tokenLength} tokenPrefix=${tokenPrefix}`);

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const text = await response.text().catch(() => null);
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        // keep raw text in data for diagnostics
        data = text;
      }

      console.log(`[API DEBUG] ${method} ${url} status=${response.status} bodyPreview=${typeof data === 'string' ? data?.slice?.(0,200) : JSON.stringify(data)?.slice?.(0,200)}`);

      if (!response.ok) {
        const serverMessage: string | undefined = data?.error || data?.message;

        if (response.status === 401) {
          return {
            success: false,
            error: serverMessage || 'Your CHECKSCROW session is no longer valid. Please sign in again.',
            code: data?.code || 'UNAUTHORIZED',
            status: response.status,
          };
        }

        if (response.status === 403) {
          return {
            success: false,
            error: serverMessage || 'Access denied. You do not have permission to access this resource.',
            code: data?.code || 'FORBIDDEN',
            status: response.status,
          };
        }

        if (response.status === 404) {
          return {
            success: false,
            error: serverMessage || 'This CHECKSCROW feature is not available on the server yet.',
            code: data?.code || 'NOT_FOUND',
            status: response.status,
          };
        }

        if (response.status >= 500) {
          return {
            success: false,
            error: serverMessage || 'CHECKSCROW is temporarily unavailable. Please try again shortly.',
            code: data?.code || `ERR_${response.status}`,
            status: response.status,
          };
        }

        return {
          success: false,
          error: serverMessage || 'Something went wrong while connecting to CHECKSCROW. Please try again.',
          code: data?.code || `ERR_${response.status}`,
          status: response.status,
        };
      }

      return {
        success: true,
        data: data?.data ?? data,
        message: data?.message,
        pagination: data?.pagination,
        status: response.status,
      };
    } catch (err: any) {
      // DEVELOPMENT DIAGNOSTIC: Surface transport-level failure with rich but safe details
      const errName = err?.name || '(unknown)';
      const errMessage = err?.message || '(no message)';
      console.error(`[API DEBUG] Request to ${url} failed:`, errName, errMessage);

      // Additional heuristics to help differentiate failures
      try {
        if (typeof window !== 'undefined' && (window as any).navigator && !(window as any).navigator.onLine) {
          console.warn('[API DEBUG] Navigator reports offline');
        }
      } catch {}

      return {
        success: false,
        error: 'Unable to reach CHECKSCROW. Please check your internet connection and try again.',
        code: 'NETWORK_ERROR',
      };
    }
  }

  public get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  public post<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
