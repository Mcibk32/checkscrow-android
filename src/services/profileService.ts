import { api } from './api';
import { ApiResponse, UserProfile } from '../types';

export interface UpdateProfilePayload {
  fullName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
}

export interface SecuritySettingsPayload {
  currentPassword?: string;
  newPassword?: string;
  enable2FA?: boolean;
}

export const profileService = {
  async getProfile(): Promise<ApiResponse<UserProfile>> {
    return api.get<UserProfile>('/user/profile');
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<ApiResponse<UserProfile>> {
    return api.put<UserProfile>('/user/profile', payload);
  },

  async updateSecuritySettings(payload: SecuritySettingsPayload): Promise<ApiResponse<{ message: string }>> {
    return api.put<{ message: string }>('/user/security', payload);
  }
};
