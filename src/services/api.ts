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

class ApiClient {
  private token: string | null = null;
  private tokenGetter: (() => Promise<string | null>) | null = null;

  constructor() {
    this.token = typeof window !== 'undefined' ? localStorage.getItem('checkscrow_auth_token') : null;
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
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('checkscrow_auth_token', token);
      } else {
        localStorage.removeItem('checkscrow_auth_token');
      }
    }
  }

  public async getEffectiveToken(): Promise<string | null> {
    if (this.tokenGetter) {
      try {
        const freshToken = await this.tokenGetter();
        if (freshToken) return freshToken;
      } catch (err) {
        console.warn('[API] tokenGetter threw an error while retrieving token:', err?.message || err);
      }
    }
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('checkscrow_auth_token');
    }
    return this.token;
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('checkscrow_auth_token');
    }
    return this.token;
  }

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${API_BASE_URL}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const currentToken = await this.getEffectiveToken();
    const tokenPresent = !!currentToken;
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    try {
      console.log(`[API] ${options.method || 'GET'} ${url} tokenPresent=${tokenPresent}`);

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => null);

      console.log(`[API] ${options.method || 'GET'} ${url} status=${response.status}`);

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          return {
            success: false,
            error: data?.error || data?.message || 'Authentication session expired. Please sign in again.',
            code: 'UNAUTHORIZED',
          };
        }

        if (response.status === 403) {
          return {
            success: false,
            error: data?.error || data?.message || 'Access denied. You do not have permission to access this resource.',
            code: 'FORBIDDEN',
          };
        }

        if (response.status === 404) {
          return {
            success: false,
            error: data?.error || data?.message || 'The requested CHECKSCROW API resource was not found. Please try again.',
            code: 'NOT_FOUND',
          };
        }

        return {
          success: false,
          error: data?.error || data?.message || 'Something went wrong while connecting to CHECKSCROW. Please try again.',
          code: data?.code || `ERR_${response.status}`,
        };
      }

      return {
        success: true,
        data: data?.data ?? data,
        message: data?.message,
        pagination: data?.pagination,
      };
    } catch (err: any) {
      // Surface the real transport-level failure (CORS, TLS, DNS, refused, etc.)
      console.error(`[API] Request to ${url} failed:`, err?.name, err?.message, err);
      return {
        success: false,
        error: 'Unable to connect to CHECKSCROW server. Please check your internet connection.',
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
