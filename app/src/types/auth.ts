/**
 * Authentication-related TypeScript types.
 * Mirrors the Platform API auth/user schemas.
 */

/** Everyone is a "user"; publishing is a verification status on that user. */
export type AccountType = 'user' | 'admin';
export type PublisherStatus = 'none' | 'pending_approval' | 'approved_pending_payment' | 'active' | 'rejected';

export interface User {
  id: string;
  account_type: AccountType;
  publisher_status: PublisherStatus;
  premium_until: string | null;
  subscription_cancelled: boolean;
  suspended: boolean;
  username: string;
  email: string;
  full_name: string | null;
  /** Profile picture URL. */
  avatar_url?: string | null;
  /** App language used for push notifications. */
  language?: 'bn' | 'en';
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  /** The 6-digit code from the verification email. */
  email_code?: string;
}

export interface LoginRequest {
  username_or_email: string;
  password: string;
}

/** Entitlement checks mirrored from the server; the server remains the authority. */
export function isPremium(user: User | null | undefined): boolean {
  return Boolean(
    user &&
      user.account_type === 'user' &&
      !user.suspended &&
      user.premium_until &&
      new Date(user.premium_until).getTime() > Date.now(),
  );
}

export function isActivePublisher(user: User | null | undefined): boolean {
  return Boolean(user && user.account_type === 'user' && !user.suspended && user.publisher_status === 'active');
}
