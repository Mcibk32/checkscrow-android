import { api } from './api';
import { ApiResponse, UserProfile } from '../types';

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
  token: string;
  user: UserProfile;
}

export const authService = {
  async login(payload: LoginPayload): Promise<ApiResponse<AuthResponse>> {
    const res = await api.post<AuthResponse>('/auth/login', payload);
    if (res.success && res.data?.token) {
      api.setToken(res.data.token);
    }
    return res;
  },

  async register(payload: RegisterPayload): Promise<ApiResponse<AuthResponse>> {
    const res = await api.post<AuthResponse>('/auth/register', payload);
    if (res.success && res.data?.token) {
      api.setToken(res.data.token);
    }
    return res;
  },

  async getCurrentUser(): Promise<ApiResponse<UserProfile>> {
    return api.get<UserProfile>('/auth/me');
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
    api.setToken(null);
  },

  async onboardProfile(payload: { fullName?: string; phoneNumber?: string; role?: string }): Promise<ApiResponse<UserProfile>> {
    return api.post<UserProfile>('/profile/onboard', payload);
  },

  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return api.post<{ message: string }>('/auth/forgot-password', { email });
  }
};
