/**
 * Notifications repository: inbox, read state and device push-token registration.
 */

import { apiClient } from './client';

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
}

/** Title and body in the app language (the server keeps an English copy in data). */
export function notificationText(n: AppNotification, english: boolean): { title: string; body: string } {
  if (english && n.data?.title_en) return { title: n.data.title_en, body: n.data.body_en ?? '' };
  return { title: n.title, body: n.body };
}

export const notificationsApi = {
  list(page = 1, size = 30): Promise<AppNotification[]> {
    return apiClient.get<AppNotification[]>(`/notifications?page=${page}&size=${size}`);
  },

  async unreadCount(): Promise<number> {
    return (await apiClient.get<{ count: number }>('/notifications/unread-count')).count;
  },

  markRead(id: string): Promise<AppNotification> {
    return apiClient.post<AppNotification>(`/notifications/${id}/read`);
  },

  markAllRead(): Promise<unknown> {
    return apiClient.post('/notifications/read-all');
  },

  registerPushToken(token: string, platform: 'android' | 'ios' | 'web'): Promise<void> {
    return apiClient.post<void>('/notifications/push-tokens', { token, platform });
  },
};
