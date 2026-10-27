/**
 * Audiobook-related TypeScript types.
 * Mirrors the Platform API audiobook schemas.
 */

export type AudiobookStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type AudiobookVisibility = 'PUBLIC' | 'PRIVATE';
export type AccessTier = 'free' | 'premium';

export interface Audiobook {
  id: string;
  owner_id: string;
  title: string;
  author: string | null;
  description: string | null;
  genre: string | null;
  access_tier: AccessTier;
  channel_id: string | null;
  publication_status: string;
  moderated: boolean;
  cover_image_url: string | null;
  source_file_url: string | null;
  audio_url: string | null;
  duration_seconds: number;
  language: string;
  visibility: AudiobookVisibility;
  status: AudiobookStatus;
  created_at: string;
  updated_at: string;
}

export interface AudiobookCreate {
  title: string;
  author?: string;
  description?: string;
  language: string;
  visibility: AudiobookVisibility;
  genre?: string;
  access_tier?: AccessTier;
  channel_id?: string;
}

export interface AudiobookUpdate {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
  genre?: string;
  access_tier?: AccessTier;
  channel_id?: string | null;
}

export interface AudiobookListResponse {
  items: Audiobook[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export type CatalogSort = 'newest' | 'oldest' | 'title' | 'shortest' | 'longest';

export interface AudiobookQuery {
  q?: string;
  sort?: CatalogSort;
  genre?: string;
  language?: string;
  access_tier?: AccessTier;
  publisher?: string;
  channel?: string;
  page?: number;
  size?: number;
}
