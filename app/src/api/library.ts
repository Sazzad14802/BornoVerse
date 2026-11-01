/**
 * Library & playlist repository: the listener's personal collections.
 */

import { apiClient } from './client';
import { LibraryListResponse } from '../types/library';
import { Audiobook } from '../types/audiobook';
import { Playlist } from '../types/domain';

export const libraryApi = {
  list(page = 1, size = 50): Promise<LibraryListResponse> {
    return apiClient.get<LibraryListResponse>(`/library?page=${page}&size=${size}`);
  },

  async isSaved(audiobookId: string): Promise<boolean> {
    const result = await apiClient.get<{ saved: boolean }>(`/library/${audiobookId}`);
    return result.saved;
  },

  add(audiobookId: string): Promise<unknown> {
    return apiClient.post(`/library/${audiobookId}`);
  },

  remove(audiobookId: string): Promise<void> {
    return apiClient.delete<void>(`/library/${audiobookId}`);
  },
};

export const playlistsApi = {
  /** The listener's own playlists, or (scope 'channel') their channel's public playlists. */
  list(scope: 'personal' | 'channel' = 'personal'): Promise<Playlist[]> {
    return apiClient.get<Playlist[]>(`/playlists?scope=${scope}`);
  },

  create(name: string, channel = false): Promise<Playlist> {
    return apiClient.post<Playlist>('/playlists', { name, channel });
  },

  remove(playlistId: string): Promise<unknown> {
    return apiClient.delete(`/playlists/${playlistId}`);
  },

  books(playlistId: string): Promise<Audiobook[]> {
    return apiClient.get<Audiobook[]>(`/playlists/${playlistId}/books`);
  },

  addBook(playlistId: string, audiobookId: string): Promise<unknown> {
    return apiClient.put(`/playlists/${playlistId}/books/${audiobookId}`);
  },

  removeBook(playlistId: string, audiobookId: string): Promise<unknown> {
    return apiClient.delete(`/playlists/${playlistId}/books/${audiobookId}`);
  },
};
