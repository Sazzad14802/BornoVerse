/**
 * ExploreScreen — browse the public catalog with the shared filter bar
 * (genre, language, access, sort). Results page in on demand.
 */

import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { AudiobookCard } from '../../components/AudiobookCard';
import { CatalogFilters, DEFAULT_FILTERS, filterQuery, isFiltered } from '../../components/CatalogFilters';
import { StateView } from '../../components/StateView';
import { AppButton } from '../../components/AppButton';
import { audiobooksApi } from '../../api/audiobooks';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { Audiobook, AudiobookListResponse } from '../../types/audiobook';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const PAGE_SIZE = 20;

export function ExploreScreen() {
  const { navigation } = useAppNavigation();
  const { loadAudiobook } = usePlayer();
  const { t, tx } = useLanguage();

  const [filterValues, setFilterValues] = useState(DEFAULT_FILTERS);
  const [extra, setExtra] = useState<Audiobook[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const filters = filterQuery(filterValues);

  const first = useResource<AudiobookListResponse>(async () => {
    setExtra([]);
    setPage(1);
    return audiobooksApi.list({ ...filters, page: 1, size: PAGE_SIZE });
  }, [filterValues]);

  const books = [...(first.data?.items ?? []), ...extra];
  const hasMore = !!first.data && page < first.data.pages;

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await audiobooksApi.list({ ...filters, page: page + 1, size: PAGE_SIZE });
      setExtra((current) => [...current, ...next.items]);
      setPage(page + 1);
    } catch (error) {
      Alert.alert(tx('লোড করা যায়নি', 'Could not load more'), errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const playBook = async (book: Audiobook) => {
    try {
      await loadAudiobook(book);
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (error) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(error));
    }
  };

  const header = (
    <View style={styles.headerBlock}>
      <Pressable
        style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
        onPress={() => navigation.navigate('SearchResults', {})}
        accessibilityRole="search"
      >
        <Ionicons name="search" size={20} color={Colors.textMuted} />
        <Text style={styles.searchPlaceholder}>{t('searchPlaceholder')}</Text>
      </Pressable>

      <CatalogFilters value={filterValues} onChange={setFilterValues} />
      {first.data ? (
        <Text style={styles.count}>{tx(`${first.data.total}টি অডিওবুক`, `${first.data.total} audiobooks`)}</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={t('exploreTitle')} subtitle={t('exploreSub')} />
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={first.isRefreshing} onRefresh={first.refresh} tintColor={Colors.primary} />
        }
        renderItem={({ item }) => (
          <AudiobookCard
            audiobook={item}
            onPress={() => navigation.navigate('Player', { audiobookId: item.id })}
            onPlayPress={() => playBook(item)}
          />
        )}
        ListEmptyComponent={
          first.isLoading ? (
            <StateView kind="loading" />
          ) : first.error ? (
            <StateView kind="error" message={first.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={first.reload} />
          ) : (
            <StateView
              kind="empty"
              title={t('noResultsTitle')}
              message={tx('অন্য ফিল্টার বেছে দেখুন।', 'Try a different filter.')}
              actionLabel={isFiltered(filterValues) ? tx('ফিল্টার মুছুন', 'Clear filters') : undefined}
              onAction={isFiltered(filterValues) ? () => setFilterValues(DEFAULT_FILTERS) : undefined}
            />
          )
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footer}>
              <AppButton
                label={tx('আরও দেখুন', 'Load more')}
                onPress={loadMore}
                isLoading={loadingMore}
                variant="secondary"
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  headerBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchBar: {
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
  },
  count: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  footer: {
    marginTop: Spacing.md,
  },
});
