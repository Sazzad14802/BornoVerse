/**
 * Account repositories: profile, subscriptions & payments, publisher operations,
 * content reports and public catalog facets.
 */

import { apiClient } from './client';
import { User } from '../types/auth';
import { Channel, OrderKind, PaymentOrder, Plan, PublicChannel, PublisherApplication, PublisherDashboard, Withdrawal, PayoutDetails } from '../types/domain';
import { PickedFile, toFormData } from './upload';

export const profileApi = {
  update(fullName: string): Promise<User> {
    return apiClient.patch<User>('/users/me', { full_name: fullName });
  },

  /** App language for push notifications. */
  setLanguage(language: 'bn' | 'en'): Promise<User> {
    return apiClient.patch<User>('/users/me', { language });
  },

  uploadAvatar(file: PickedFile): Promise<User> {
    return apiClient.uploadFile<User>('/users/me/avatar', toFormData(file, 'image/jpeg'));
  },

  removeAvatar(): Promise<User> {
    return apiClient.delete<User>('/users/me/avatar');
  },

  /** Permanently deletes the account and everything in it. */
  deleteAccount(): Promise<{ deleted: boolean }> {
    return apiClient.post('/users/me/delete', { confirm: 'DELETE' });
  },
};

/** The active plan, and whether a plan can be bought now (no Premium, or its last day). */
export interface CurrentSubscription {
  plan: { id: string | null; name: string; months: number } | null;
  premium_until: string | null;
  can_buy: boolean;
  /** When renewing opens (one day before expiry), while it is still closed. */
  renew_from: string | null;
}

/** Details of a completed payment, for the receipt and the invoice PDF. */
export interface Invoice {
  invoice_number: string;
  order_id: string;
  issued_at: string;
  status: string;
  customer: { name: string; email: string; serial: number | null };
  item: string;
  item_bn: string;
  kind: 'subscription' | 'publisher_registration';
  months: number;
  amount: string;
  currency: string;
  provider: string;
  transaction_id: string;
  bank_transaction_id: string | null;
}

export const subscriptionApi = {
  plans(): Promise<Plan[]> {
    return apiClient.get<Plan[]>('/subscriptions/plans', false);
  },

  current(): Promise<CurrentSubscription> {
    return apiClient.get<CurrentSubscription>('/subscriptions/current');
  },

  cancel(): Promise<{ message: string; premium_until: string | null }> {
    return apiClient.post('/subscriptions/cancel');
  },
};

export const paymentsApi = {
  list(): Promise<PaymentOrder[]> {
    return apiClient.get<PaymentOrder[]>('/payments');
  },

  /** Creates (or idempotently returns) a pending order priced by the server. */
  initiate(kind: OrderKind, idempotencyKey: string, planId?: string): Promise<PaymentOrder> {
    return apiClient.post<PaymentOrder>('/payments', {
      kind,
      plan_id: planId ?? null,
      idempotency_key: idempotencyKey,
    });
  },

  invoice(orderId: string): Promise<Invoice> {
    return apiClient.get<Invoice>(`/payments/${orderId}/invoice`);
  },

  get(orderId: string): Promise<PaymentOrder> {
    return apiClient.get<PaymentOrder>(`/payments/${orderId}`);
  },

  /** Opens an SSLCommerz hosted checkout session for a pending order. */
  checkout(orderId: string, returnUrl: string): Promise<{ order_id: string; gateway_url: string }> {
    return apiClient.post(`/payments/${orderId}/checkout`, { return_url: returnUrl });
  },

  /** Development-only: settle a mock-gateway order. */
  mockConfirm(orderId: string, status: 'success' | 'failed' | 'cancelled'): Promise<PaymentOrder> {
    return apiClient.post<PaymentOrder>(`/payments/${orderId}/mock-confirm`, { status });
  },
};

export interface PublisherAnalytics {
  days: number;
  channel: { id: string; name: string } | null;
  followers: number;
  new_followers: number;
  listen_seconds: number;
  plays: number;
  distinct_listeners: number;
  all_time_listeners: number;
  eligible_views: number;
  audiobooks: number;
  reports: { total: number; open: number; action_taken: number; dismissed: number };
  daily: { date: string; followers: number; listen_seconds: number; listeners: number }[];
  top_audiobooks: { id: string; title: string; listen_seconds: number }[];
}

export const publisherApi = {
  applications(): Promise<PublisherApplication[]> {
    return apiClient.get<PublisherApplication[]>('/publisher/applications');
  },

  apply(legalName: string, document: PickedFile): Promise<PublisherApplication> {
    const form = toFormData(document, 'application/pdf');
    form.append('legal_name', legalName);
    return apiClient.uploadFile<PublisherApplication>('/publisher/applications', form);
  },

  async registrationFee(): Promise<string> {
    return (await apiClient.get<{ amount: string }>('/publisher/registration-fee')).amount;
  },

  channels(): Promise<Channel[]> {
    return apiClient.get<Channel[]>('/publisher/channels');
  },

  createChannel(name: string, description: string): Promise<Channel> {
    return apiClient.post<Channel>('/publisher/channels', { name, description });
  },

  uploadChannelAvatar(id: string, file: PickedFile): Promise<Channel> {
    return apiClient.uploadFile<Channel>(`/publisher/channels/${id}/avatar`, toFormData(file, 'image/jpeg'));
  },

  removeChannelAvatar(id: string): Promise<Channel> {
    return apiClient.delete<Channel>(`/publisher/channels/${id}/avatar`);
  },

  /** Deletes the channel; its audiobooks stay in My audiobooks as private. */
  deleteChannel(id: string): Promise<{ deleted: boolean; audiobooks_kept: number }> {
    return apiClient.delete(`/publisher/channels/${id}`);
  },

  updateChannel(id: string, name: string, description: string): Promise<Channel> {
    return apiClient.put<Channel>(`/publisher/channels/${id}`, { name, description });
  },

  dashboard(): Promise<PublisherDashboard> {
    return apiClient.get<PublisherDashboard>('/publisher/dashboard');
  },

  requestWithdrawal(amount: string, payout: PayoutDetails): Promise<Withdrawal> {
    return apiClient.post<Withdrawal>('/publisher/withdrawals', { amount, ...payout });
  },

  analytics(days = 30): Promise<PublisherAnalytics> {
    return apiClient.get<PublisherAnalytics>(`/publisher/analytics?days=${days}`);
  },
};

export const reportsApi = {
  submit(audiobookId: string, reason: string): Promise<unknown> {
    return apiClient.post('/reports', { audiobook_id: audiobookId, reason });
  },
};

export const catalogApi = {
  publishers(): Promise<{ id: string; name: string }[]> {
    return apiClient.get('/catalog/publishers', false);
  },

  channels(): Promise<PublicChannel[]> {
    return apiClient.get<PublicChannel[]>('/catalog/channels', false);
  },
};
