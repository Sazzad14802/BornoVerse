/**
 * SearchResultsScreen — live search over title and author (debounced), narrowed
 * by the shared filter bar. Before typing it shows recent searches; a search is
 * remembered once the listener submits it or opens one of its results.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AudiobookCard } from '../../components/AudiobookCard';
import { CatalogFilters, DEFAULT_FILTERS, filterQuery, isFiltered } from '../../components/CatalogFilters';
import { StateView } from '../../components/StateView';
import { audiobooksApi } from '../../api/audiobooks';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { ExploreStackParamList } from '../../navigation/types';
import { recentSearches } from '../../storage/recentSearches';
import { Audiobook } from '../../types/audiobook';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

export function SearchResultsScreen() {
  const { navigation } = useAppNavigation();
  const route = useRoute<RouteProp<ExploreStackParamList, 'SearchResults'>>();
  const { loadAudiobook } = usePlayer();
  const { t, tx } = useLanguage();

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState<Audiobook[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const latest = useRef(0);

  const term = query.trim();
  // Filters alone are a valid search ("all premium Bangla poetry").
  const active = term.length >= MIN_LENGTH || isFiltered(filters);

  useEffect(() => {
    recentSearches.list().then(setRecent);
  }, []);

  useEffect(() => {
    const requestId = ++latest.current;
    if (!active) {
      setResults([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const page = await audiobooksApi.list({
          ...filterQuery(filters),
          q: term.length >= MIN_LENGTH ? term : undefined,
          size: 40,
        });
        if (requestId !== latest.current) return;
        setResults(page.items);
        setTotal(page.total);
        setStatus('done');
      } catch (e) {
        if (requestId !== latest.current) return;
        setError(errorMessage(e));
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, filters, active]);

  const remember = () => {
    if (term.length >= MIN_LENGTH) recentSearches.add(term).then(setRecent);
  };

  const open = (book: Audiobook) => {
    remember();
    navigation.navigate('Player', { audiobookId: book.id });
  };

  const playBook = async (book: Audiobook) => {
    remember();
    try {
      await loadAudiobook(book);
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (e) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(e));
    }
  };

  const idleContent = recent.length ? (
    <View style={styles.recent}>
      <View style={styles.recentHeader}>
        <Text style={styles.sectionTitle}>{tx('সাম্প্রতিক অনুসন্ধান', 'Recent searches')}</Text>
        <Pressable
          onPress={() => recentSearches.clear().then(() => setRecent([]))}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.link}>{tx('মুছুন', 'Clear')}</Text>
        </Pressable>
      </View>
      {recent.map((item) => (
        <Pressable
          key={item}
          onPress={() => setQuery(item)}
          style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.recentText} numberOfLines={1}>
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  ) : (
    <StateView
      kind="empty"
      compact
      title={tx('কী শুনতে চান?', 'What would you like to hear?')}
      message={tx('বইয়ের নাম বা লেখকের নাম লিখুন, অথবা ফিল্টার বেছে নিন।', 'Search by title or author, or pick a filter.')}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={tx('ফিরে যান', 'Go back')}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={remember}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={tx('মুছুন', 'Clear')}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filters}>
        <CatalogFilters value={filters} onChange={setFilters} />
      </View>

      <FlatList
        data={active ? results : []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          active && status === 'done' && results.length ? (
            <Text style={styles.count}>{tx(`${total}টি ফলাফল`, `${total} ${total === 1 ? 'result' : 'results'}`)}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <AudiobookCard audiobook={item} onPress={() => open(item)} onPlayPress={() => playBook(item)} />
        )}
        ListEmptyComponent={
          !active ? (
            idleContent
          ) : status === 'loading' ? (
            <StateView kind="loading" compact />
          ) : status === 'error' ? (
            <StateView kind="error" compact message={error} />
          ) : status === 'done' ? (
            <StateView
              kind="empty"
              compact
              title={t('noResultsTitle')}
              message={tx('অন্য শব্দ বা ফিল্টার দিয়ে চেষ্টা করুন।', 'Try another word or fewer filters.')}
              actionLabel={isFiltered(filters) ? tx('ফিল্টার মুছুন', 'Clear filters') : undefined}
              onAction={isFiltered(filters) ? () => setFilters(DEFAULT_FILTERS) : undefined}
            />
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.md,
    paddingTop: Spacing.sm,
  },
  back: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flex: 1,
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
  input: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  filters: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  count: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recent: {
    paddingTop: Spacing.xs,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  link: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  recentText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  pressed: {
    opacity: 0.6,
  },
});
