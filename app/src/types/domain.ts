/**
 * Domain types for platform features beyond the core catalog.
 * Each mirrors a Platform API response shape.
 */

import { Audiobook } from './audiobook';

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  /** Set for a publisher's channel playlist. */
  channel_id?: string | null;
  /** Number of audiobooks in it. */
  count?: number;
  created_at: string;
}

export interface Channel {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  moderated: boolean;
  avatar_url?: string | null;
}

export interface PublicChannel {
  id: string;
  name: string;
  publisher_id: string;
}

export interface Plan {
  id: string;
  name: string;
  months: number;
  price: string;
  active: boolean;
}

export type OrderKind = 'subscription' | 'publisher_registration';
export type OrderStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface PaymentOrder {
  id: string;
  kind: OrderKind;
  plan_id: string | null;
  months: number;
  amount: string;
  status: OrderStatus;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface PublisherApplication {
  id: string;
  legal_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  month: string;
  amount: string;
  kind: string;
  created_at: string;
}

export type PayoutMethod = 'bkash' | 'nagad' | 'rocket' | 'bank';

export interface Withdrawal {
  id: string;
  amount: string;
  destination: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason: string;
  created_at: string;
  method?: PayoutMethod | 'other';
  /** Set by the admin: when the money will be sent, and the payout record. */
  scheduled_for?: string | null;
  paid_at?: string | null;
  payout_reference?: string;
  payout_note?: string;
}

export interface PayoutDetails {
  method: PayoutMethod;
  account_name: string;
  account_number: string;
  bank_name: string;
  branch: string;
}

export interface PublisherDashboard {
  available_balance: string;
  lifetime_earned: string;
  withdrawn: string;
  pending_withdrawals: string;
  /** This month so far, split the way the month close will split it. */
  this_month: { month: string; estimated: string; eligible_views: number; all_eligible_views: number; publisher_percent: number };
  followers: number;
  eligible_views: number;
  audiobooks: number;
  ledger: LedgerEntry[];
  withdrawals: Withdrawal[];
}

export interface GenerationQuota {
  used: number;
  limit: number;
  plan: 'free' | 'premium' | 'publisher';
  month: string;
}

export interface RecentPlayback {
  audiobook: Audiobook;
  chapter_id: string | null;
  position_seconds: number;
  progress_percent: number;
  updated_at: string;
}

export interface PlayManifestChapter {
  id: string;
  title: string;
  chapter_number: number;
  duration_seconds: number;
  audio_url: string;
}

export interface PlayManifest {
  session_id: string;
  chapters: PlayManifestChapter[];
  expires_in: number;
}

export interface OfflineLicense extends PlayManifest {
  expires_at: string;
  user_id: string;
}
