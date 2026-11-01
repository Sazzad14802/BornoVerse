/**
 * Audiobook repository: catalog discovery, owner CRUD, uploads and chapters.
 */

import { apiClient, UploadOptions } from './client';
import {
  Audiobook,
  AudiobookCreate,
  AudiobookListResponse,
  AudiobookQuery,
  AudiobookUpdate,
  AudiobookVisibility,
} from '../types/audiobook';
import { Chapter } from '../types/chapter';
import { appendFile, PickedFile, toFormData } from './upload';

function queryString(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const audiobooksApi = {
  /** Public, completed catalog (never returns private books). */
  list(query: AudiobookQuery = {}): Promise<AudiobookListResponse> {
    const { page = 1, size = 20, ...filters } = query;
    return apiClient.get<AudiobookListResponse>(`/audiobooks${queryString({ page, size, ...filters })}`);
  },

  get(id: string): Promise<Audiobook> {
    return apiClient.get<Audiobook>(`/audiobooks/${id}`);
  },

  listMine(page = 1, size = 50): Promise<AudiobookListResponse> {
    return apiClient.get<AudiobookListResponse>(`/audiobooks/my${queryString({ page, size })}`);
  },

  create(data: AudiobookCreate): Promise<Audiobook> {
    return apiClient.post<Audiobook>('/audiobooks', data);
  },

  update(id: string, data: AudiobookUpdate): Promise<Audiobook> {
    return apiClient.patch<Audiobook>(`/audiobooks/${id}`, data);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/audiobooks/${id}`);
  },

  setVisibility(id: string, visibility: AudiobookVisibility): Promise<Audiobook> {
    return apiClient.patch<Audiobook>(`/audiobooks/${id}/visibility`, { visibility });
  },

  uploadSource(id: string, file: PickedFile, options?: UploadOptions): Promise<Audiobook> {
    return apiClient.uploadFile<Audiobook>(`/audiobooks/${id}/source`, toFormData(file, 'application/pdf'), true, options);
  },

  /** Finished narration (publishers): each MP3, in order, becomes one chapter. */
  uploadAudio(id: string, files: PickedFile[]): Promise<{ id: string; duration_seconds: number; chapters: number }> {
    const form = new FormData();
    files.forEach((file) => appendFile(form, file, 'audio/mpeg', 'files'));
    return apiClient.uploadFile(`/audiobooks/${id}/audio`, form);
  },

  uploadCover(id: string, file: PickedFile): Promise<Audiobook> {
    return apiClient.uploadFile<Audiobook>(`/audiobooks/${id}/cover`, toFormData(file, 'image/jpeg'));
  },

  chapters(id: string): Promise<Chapter[]> {
    return apiClient.get<Chapter[]>(`/audiobooks/${id}/chapters`);
  },
};
