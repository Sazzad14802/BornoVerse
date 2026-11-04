/**
 * Catalog filters shared by Explore and Search: a filter icon (with the number
 * of active filters) that sits next to the search bar and opens a sheet with
 * Genre · Language · Access · Sort as dropdowns (opening in place inside the sheet).
 * `FilterSummary` shows the active filters in one line with a Clear link.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { ModalBottomSheet, SheetScrollView } from './ModalBottomSheet';
import { GENRES, LANGUAGES } from '../constants/genres';
import { useLanguage } from '../contexts/LanguageContext';
import { AccessTier, AudiobookQuery, CatalogSort } from '../types/audiobook';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

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
  return activeCount(f) > 0;
}

function activeCount(f: CatalogFilterValues): number {
  return [f.genre !== '', f.language !== '', f.tier !== '', f.sort !== 'newest'].filter(Boolean).length;
}

function useFilterOptions() {
  const { tx, isEnglish } = useLanguage();
  return {
    genre: [
      { value: '', label: tx('সব', 'All') },
      ...GENRES.map((g) => ({ value: g.key, label: isEnglish ? g.en : g.bn })),
    ],
    language: [
      { value: '', label: tx('সব', 'All') },
      ...LANGUAGES.map((l) => ({ value: l.key, label: isEnglish ? l.en : l.bn })),
    ],
    tier: [
      { value: '' as const, label: tx('সব', 'All') },
      { value: 'free' as const, label: tx('ফ্রি', 'Free') },
      { value: 'premium' as const, label: tx('প্রিমিয়াম', 'Premium') },
    ],
    sort: [
      { value: 'newest' as const, label: tx('নতুন আগে', 'Newest first') },
      { value: 'oldest' as const, label: tx('পুরনো আগে', 'Oldest first') },
      { value: 'title' as const, label: tx('নাম (অ-ঔ / A-Z)', 'Title (A-Z)') },
      { value: 'shortest' as const, label: tx('ছোট আগে', 'Shortest first') },
      { value: 'longest' as const, label: tx('বড় আগে', 'Longest first') },
    ],
  };
}

interface FilterProps {
  value: CatalogFilterValues;
  onChange: (value: CatalogFilterValues) => void;
}

/** Square filter icon for the right of a search bar; opens the filter sheet. */
export function FilterButton({ value, onChange }: FilterProps) {
  const { tx } = useLanguage();
  const options = useFilterOptions();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [openField, setOpenField] = useState<keyof CatalogFilterValues | null>(null);
  const count = activeCount(value);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setOpenField(null);
    }
  }, [open]);

  const set = (patch: Partial<CatalogFilterValues>) => setDraft((current) => ({ ...current, ...patch }));
  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, count > 0 && styles.buttonActive, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={tx(`ফিল্টার${count ? `, ${count}টি চালু` : ''}`, `Filters${count ? `, ${count} active` : ''}`)}
      >
        <Ionicons name="options-outline" size={22} color={count > 0 ? Colors.textOnPrimary : Colors.textPrimary} />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        ) : null}
      </Pressable>

      <ModalBottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{tx('ফিল্টার', 'Filters')}</Text>
            {isFiltered(draft) ? (
              <Pressable onPress={() => setDraft(DEFAULT_FILTERS)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>{tx('সব মুছুন', 'Reset')}</Text>
              </Pressable>
            ) : null}
          </View>
          <SheetScrollView maxHeight={440}>
            <View style={styles.groups}>
              <InlineSelect
                label={tx('ধরন', 'Genre')}
                icon="pricetags-outline"
                value={draft.genre}
                options={options.genre}
                open={openField === 'genre'}
                onToggle={() => setOpenField(openField === 'genre' ? null : 'genre')}
                onChange={(genre) => set({ genre })}
              />
              <InlineSelect
                label={tx('ভাষা', 'Language')}
                icon="language-outline"
                value={draft.language}
                options={options.language}
                open={openField === 'language'}
                onToggle={() => setOpenField(openField === 'language' ? null : 'language')}
                onChange={(language) => set({ language })}
              />
              <InlineSelect<'' | AccessTier>
                label={tx('অ্যাক্সেস', 'Access')}
                icon="lock-open-outline"
                value={draft.tier}
                options={options.tier}
                open={openField === 'tier'}
                onToggle={() => setOpenField(openField === 'tier' ? null : 'tier')}
                onChange={(tier) => set({ tier })}
              />
              <InlineSelect<CatalogSort>
                label={tx('সাজান', 'Sort')}
                icon="swap-vertical-outline"
                value={draft.sort}
                options={options.sort}
                open={openField === 'sort'}
                onToggle={() => setOpenField(openField === 'sort' ? null : 'sort')}
                onChange={(sort) => set({ sort })}
              />
            </View>
          </SheetScrollView>
          <AppButton label={tx('ফলাফল দেখুন', 'Show results')} onPress={apply} />
        </View>
      </ModalBottomSheet>
    </>
  );
}

/** A dropdown that opens in place: the chosen value, then the options below it. */
function InlineSelect<T extends string>({
  label,
  icon,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: T;
  options: { value: T; label: string }[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: T) => void;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <View style={styles.select}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.selectField, open && styles.selectFieldOpen, pressed && styles.pressed]}
        accessibilityRole="combobox"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
      >
        <Ionicons name={icon} size={18} color={Colors.textSecondary} />
        <Text style={styles.selectValue} numberOfLines={1}>
          {selected?.label}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {options.map((option, i) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value || '_all'}
                onPress={() => {
                  onChange(option.value);
                  onToggle();
                }}
                style={({ pressed }) => [
                  styles.option,
                  i < options.length - 1 && styles.optionDivider,
                  active && styles.optionActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                {active ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** One line naming the active filters, with Clear; nothing when none is set. */
export function FilterSummary({ value, onChange }: FilterProps) {
  const { tx } = useLanguage();
  const options = useFilterOptions();
  if (!isFiltered(value)) return null;
  const labels = [
    value.genre && options.genre.find((o) => o.value === value.genre)?.label,
    value.language && options.language.find((o) => o.value === value.language)?.label,
    value.tier && options.tier.find((o) => o.value === value.tier)?.label,
    value.sort !== 'newest' && options.sort.find((o) => o.value === value.sort)?.label,
  ].filter(Boolean);
  return (
    <View style={styles.summary}>
      <Ionicons name="funnel-outline" size={14} color={Colors.textSecondary} />
      <Text style={styles.summaryText} numberOfLines={1}>
        {labels.join(' · ')}
      </Text>
      <Pressable onPress={() => onChange(DEFAULT_FILTERS)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>{tx('মুছুন', 'Clear')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sheet: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  groups: {
    gap: Spacing.md,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  select: {
    gap: 6,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  selectFieldOpen: {
    borderColor: Colors.primary,
  },
  selectValue: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  options: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionActive: {
    backgroundColor: Colors.primarySurface,
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  optionTextActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  link: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
