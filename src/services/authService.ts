import { api } from './api';
import { ApiResponse, UserProfile } from '../types';
import { extractSessionToken, normalizeUserProfile } from '../utils/authNormalize';

export interface LoginPayload {
  email: string;
  password?: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  phoneNumber?: string;
  password?: string;
  confirmPassword?: string;
  role?: 'buyer' | 'seller' | 'both';
}

export interface AuthResponse {
  token: string | null;
  user: UserProfile;
}

const toAuthResponse = (res: ApiResponse<unknown>, context: 'login' | 'register'): ApiResponse<AuthResponse> => {
  if (!res.success) {
    console.warn(`[AUTH] ${context} failed code=${res.code || '(none)'} status=${res.status ?? '(none)'}`);
    return res as ApiResponse<AuthResponse>;
  }

  const token = extractSessionToken(res.data);
  const user = normalizeUserProfile(res.data);

  console.log(
    `[AUTH] ${context} response parsed tokenPresent=${!!token} tokenLength=${token ? token.length : 0} userResolved=${!!user}`
  );

  if (token) {
    api.setToken(token);
  }

  if (!user) {
    return {
      success: false,
      error: 'CHECKSCROW returned an unexpected account payload. Please try again.',
      code: 'MALFORMED_AUTH_RESPONSE',
      status: res.status,
    };
  }

  return { success: true, data: { token, user }, message: res.message, status: res.status };
};

export const authService = {
  async login(payload: LoginPayload): Promise<ApiResponse<AuthResponse>> {
    // A stale token must never be attached to a fresh sign-in attempt.
    api.setToken(null);
    const res = await api.post<unknown>('/auth/login', payload);
    return toAuthResponse(res, 'login');
  },

  async register(payload: RegisterPayload): Promise<ApiResponse<AuthResponse>> {
    api.setToken(null);
    const res = await api.post<unknown>('/auth/register', payload);
    return toAuthResponse(res, 'register');
  },

  async getCurrentUser(): Promise<ApiResponse<UserProfile>> {
    const res = await api.get<unknown>('/auth/me');
    if (!res.success) {
      return res as ApiResponse<UserProfile>;
    }

    const user = normalizeUserProfile(res.data);
    if (!user) {
      console.warn('[AUTH] /auth/me returned 200 but no user could be resolved from the payload');
      return {
        success: false,
        error: 'Your CHECKSCROW session is no longer valid. Please sign in again.',
        code: 'NO_USER_IN_RESPONSE',
        status: res.status,
      };
    }
    return { success: true, data: user, status: res.status };
  },

  /**
   * Links a verified Clerk identity to its CHECKSCROW account. Requires the
   * Clerk bearer token to already be in place; the server performs the
   * cryptographic verification and the account lookup/linking.
   */
  async syncClerkSession(): Promise<ApiResponse<unknown>> {
    const res = await api.post<unknown>('/auth/sync-login');
    if (res.success) {
      // Some deployments hand back a CHECKSCROW session token for the linked
      // account; keeping it means the app survives Clerk token expiry.
      const token = extractSessionToken(res.data);
      if (token) api.setToken(token);
    }
    return res;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      api.setToken(null);
    }
  },

  async onboardProfile(payload: { fullName?: string; phoneNumber?: string; role?: string }): Promise<ApiResponse<UserProfile>> {
    return api.post<UserProfile>('/profile/onboard', payload);
  },

  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return api.post<{ message: string }>('/auth/forgot-password', { email });
  }
};
