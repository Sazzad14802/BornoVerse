/**
 * Authentication repository: email/password sessions, recovery and logout.
 */

import { apiClient } from './client';
import { LoginRequest, RegisterRequest, TokenResponse, User } from '../types/auth';

export const authApi = {
  register(data: RegisterRequest): Promise<User> {
    return apiClient.post<User>(
      '/auth/register',
      {
        username: data.username.trim(),
        full_name: data.full_name?.trim() ?? '',
        email: data.email.trim().toLowerCase(),
        password: data.password,
        email_code: data.email_code || undefined,
      },
      false,
    );
  },

  /** Checks email/username are free and emails a sign-up code (unless the server skips verification). */
  registerStart(
    email: string,
    username = '',
  ): Promise<{ verification_required: boolean; resend_after?: number; dev_code?: string }> {
    return apiClient.post('/auth/register/start', { email: email.trim().toLowerCase(), username }, false);
  },

  login(data: LoginRequest): Promise<TokenResponse> {
    return apiClient.post<TokenResponse>(
      '/auth/login',
      { ...data, username_or_email: data.username_or_email.trim() },
      false,
    );
  },

  me(): Promise<User> {
    return apiClient.get<User>('/auth/me');
  },

  /** Swaps the current (still valid) token for a fresh one, so a used device never expires. */
  renewSession(): Promise<TokenResponse> {
    return apiClient.post<TokenResponse>('/auth/session/renew');
  },

  /** Revokes every session for this account on the server. */
  logout(): Promise<unknown> {
    return apiClient.post('/auth/logout');
  },

  /** Emails a 6-digit code. `dev_code` is only returned by servers without email (development). */
  requestRecovery(email: string): Promise<{ message: string; resend_after: number; dev_code?: string }> {
    return apiClient.post('/auth/recovery', { email: email.trim().toLowerCase() }, false);
  },

  /** Exchanges the emailed code for a one-time reset token. */
  verifyRecoveryCode(email: string, code: string): Promise<{ token: string }> {
    return apiClient.post('/auth/recovery/verify', { email: email.trim().toLowerCase(), code }, false);
  },

  resetPassword(token: string, password: string): Promise<{ message: string }> {
    return apiClient.post('/auth/reset-password', { token: token.trim(), password }, false);
  },
};
