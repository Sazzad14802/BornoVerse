/**
 * The last few search terms, newest first, kept on the device.
 */

import * as SecureStore from 'expo-secure-store';

const KEY = 'bornoverse_recent_searches';
const LIMIT = 8;

export const recentSearches = {
  async list(): Promise<string[]> {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  },

  async add(term: string): Promise<string[]> {
    const clean = term.trim();
    const current = await this.list();
    const next = [clean, ...current.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, LIMIT);
    try {
      await SecureStore.setItemAsync(KEY, JSON.stringify(next));
    } catch {}
    return next;
  },

  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {}
  },
};
