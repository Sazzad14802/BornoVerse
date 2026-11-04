/**
 * Social repository: favourites (onboarding), recommendations, channel pages,
 * follows with the notification bell, and the following feed.
 */

import { apiClient } from './client';
import { Audiobook } from '../types/audiobook';

export interface Favourites {
  genres: string[];
  channels: string[];
  /** True for a new listener who has not picked favourites yet. */
  required: boolean;
  minimum: number;
}

export interface ChannelSummary {
  id: string;
  name: string;
  avatar_url?: string | null;
  description?: string;
  followers: number;
  following: boolean;
  /** The bell: notify about new uploads. */
  notify: boolean;
  is_owner: boolean;
}

export interface ChannelPlaylist {
  id: string;
  name: string;
  audiobooks: Audiobook[];
}

export interface ChannelProfile {
  id: string;
  name: string;
  avatar_url?: string | null;
  description: string;
  publisher_name: string;
  followers: number;
  audiobooks: number;
  following: boolean;
  /** The bell: notify about new uploads. */
  notify: boolean;
  is_owner: boolean;
  audiobook_items?: Audiobook[];
  playlists?: ChannelPlaylist[];
}

export interface FollowedChannel {
  id: string;
  name: string;
  notify: boolean;
}

export const socialApi = {
  favourites(): Promise<Favourites> {
    return apiClient.get<Favourites>('/me/favourites');
  },

  saveFavourites(genres: string[], channels: string[]): Promise<unknown> {
    return apiClient.put('/me/favourites', { genres, channels });
  },

  recommendations(limit = 20): Promise<{ basis: 'history' | 'favourites' | 'new'; items: Audiobook[] }> {
    return apiClient.get(`/me/recommendations?limit=${limit}`);
  },

  /** Channels to browse, most-followed first; `q` filters by name. */
  channels(q = ''): Promise<ChannelSummary[]> {
    return apiClient.get<ChannelSummary[]>(`/channels${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  },

  channel(id: string): Promise<ChannelProfile> {
    return apiClient.get<ChannelProfile>(`/channels/${id}`);
  },

  follow(id: string, notify: boolean): Promise<ChannelProfile> {
    return apiClient.put<ChannelProfile>(`/channels/${id}/follow`, { notify });
  },

  unfollow(id: string): Promise<ChannelProfile> {
    return apiClient.delete<ChannelProfile>(`/channels/${id}/follow`);
  },

  following(): Promise<FollowedChannel[]> {
    return apiClient.get<FollowedChannel[]>('/me/following');
  },

  feed(page = 1, size = 20): Promise<Audiobook[]> {
    return apiClient.get<Audiobook[]>(`/me/feed?page=${page}&size=${size}`);
  },
};
