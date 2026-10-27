/**
 * CatalogFilters — the filter bar shared by Explore and Search:
 * Genre · Language · Access · Sort dropdowns and a "Clear" link once any is set.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Dropdown } from './Dropdown';
import { GENRES, LANGUAGES } from '../constants/genres';
import { useLanguage } from '../contexts/LanguageContext';
import { AccessTier, AudiobookQuery, CatalogSort } from '../types/audiobook';
import { Colors, FontSizes, Spacing } from '../theme';

export interface CatalogFilterValues {
  genre: string;
  language: string;
  tier: '' | AccessTier;
  sort: CatalogSort;
}

export const DEFAULT_FILTERS: CatalogFilterValues = { genre: '', language: '', tier: '', sort: 'newest' };

/** API query parameters for the selected filters. */
export function filterQuery(f: CatalogFilterValues): AudiobookQuery {
  return {
    genre: f.genre || undefined,
    language: f.language || undefined,
    access_tier: f.tier || undefined,
    sort: f.sort,
  };
}

export function isFiltered(f: CatalogFilterValues): boolean {
  return f.genre !== '' || f.language !== '' || f.tier !== '' || f.sort !== 'newest';
}

interface CatalogFiltersProps {
  value: CatalogFilterValues;
  onChange: (value: CatalogFilterValues) => void;
}

export function CatalogFilters({ value, onChange }: CatalogFiltersProps) {
  const { tx, isEnglish } = useLanguage();
  const set = (patch: Partial<CatalogFilterValues>) => onChange({ ...value, ...patch });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      <Dropdown
        label={tx('ধরন', 'Genre')}
        value={value.genre}
        onChange={(genre) => set({ genre })}
        options={[
          { value: '', label: tx('সব ধরন', 'All genres') },
          ...GENRES.map((g) => ({ value: g.key, label: isEnglish ? g.en : g.bn })),
        ]}
      />
      <Dropdown
        label={tx('ভাষা', 'Language')}
        value={value.language}
        onChange={(language) => set({ language })}
        options={[
          { value: '', label: tx('সব ভাষা', 'All languages') },
          ...LANGUAGES.map((l) => ({ value: l.key, label: isEnglish ? l.en : l.bn })),
        ]}
      />
      <Dropdown<'' | AccessTier>
        label={tx('অ্যাক্সেস', 'Access')}
        value={value.tier}
        onChange={(tier) => set({ tier })}
        options={[
          { value: '', label: tx('সব', 'All') },
          { value: 'free', label: tx('ফ্রি', 'Free') },
          { value: 'premium', label: tx('প্রিমিয়াম', 'Premium') },
        ]}
      />
      <Dropdown<CatalogSort>
        label={tx('সাজান', 'Sort')}
        value={value.sort}
        onChange={(sort) => set({ sort })}
        options={[
          { value: 'newest', label: tx('নতুন আগে', 'Newest first') },
          { value: 'oldest', label: tx('পুরনো আগে', 'Oldest first') },
          { value: 'title', label: tx('নাম (অ-ঔ / A-Z)', 'Title (A-Z)') },
          { value: 'shortest', label: tx('ছোট আগে', 'Shortest first') },
          { value: 'longest', label: tx('বড় আগে', 'Longest first') },
        ]}
      />
      {isFiltered(value) ? (
        <Pressable onPress={() => onChange(DEFAULT_FILTERS)} hitSlop={8} style={styles.clear} accessibilityRole="button">
          <Text style={styles.clearText}>{tx('মুছুন', 'Clear')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clear: {
    paddingHorizontal: Spacing.xs,
  },
  clearText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
});
