/**
 * HomeScreen — greeting, then:
 * 1. Recommended for you: from the listener's favourites while they are new,
 *    from listening history once they have some.
 * 2. Recently played, newest first, with listening progress.
 * 3. From channels you follow (only when following any).
 * All content comes from the Platform API.
 */

import React, { useCallback } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AudiobookCard } from '../../components/AudiobookCard';
import { CoverTile } from '../../components/CoverTile';
import { SectionHeader } from '../../components/SectionHeader';
import { StateView } from '../../components/StateView';
import { audiobooksApi } from '../../api/audiobooks';
import { playbackApi } from '../../api/playback';
import { socialApi } from '../../api/social';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { Audiobook } from '../../types/audiobook';
import { greetingPeriod } from '../../utils/format';
import { Colors, FontSizes, Spacing } from '../../theme';

const GREETING_KEYS = {
  morning: 'greetingMorning',
  afternoon: 'greetingAfternoon',
  evening: 'greetingEvening',
  night: 'greetingEvening',
} as const;

export function HomeScreen() {
  const { navigation } = useAppNavigation();
  const { loadAudiobook } = usePlayer();
  const { user } = useAuth();
  const { t, tx } = useLanguage();
  const { unreadCount, refreshUnread } = useNotifications();
  const isMember = user?.account_type === 'user';

  const home = useResource(async () => {
    if (!isMember) return { recommended: [], basis: 'new' as const, recent: [], feed: [] };
    const [recommended, recent, feed] = await Promise.all([
      // Fall back to the newest releases if recommendations are unavailable.
      socialApi
        .recommendations(15)
        .catch(async () => ({ basis: 'new' as const, items: (await audiobooksApi.list({ size: 15 })).items })),
      playbackApi.recent().catch(() => []),
      socialApi.feed(1, 10).catch(() => []),
    ]);
    return { recommended: recommended.items, basis: recommended.basis, recent, feed };
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    await Promise.all([home.refresh(), refreshUnread()]);
  }, [home, refreshUnread]);

  const openBook = (book: Audiobook) => navigation.navigate('Player', { audiobookId: book.id });

  const playBook = async (book: Audiobook) => {
    try {
      await loadAudiobook(book);
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (error) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(error));
    }
  };

  const firstName = (user?.full_name || user?.username || '').split(' ')[0];
  const data = home.data;
  const recommendedHint =
    data?.basis === 'history'
      ? tx('আপনার শোনার ভিত্তিতে', 'Based on what you listen to')
      : data?.basis === 'favourites'
        ? tx('আপনার পছন্দের ভিত্তিতে', 'Based on your favourites')
        : tx('নতুন প্রকাশিত', 'New releases');

  const shelf = (books: Audiobook[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {books.map((book) => (
        <CoverTile key={book.id} audiobook={book} onPress={() => openBook(book)} onPlayPress={() => playBook(book)} />
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        showLogo
        title={t(GREETING_KEYS[greetingPeriod()], { name: firstName })}
        subtitle={t('greetingQuestion')}
        rightIcon="notifications-outline"
        rightIconLabel={tx('নোটিফিকেশন', 'Notifications')}
        onRightIconPress={() => navigation.navigate('Notifications')}
        badgeCount={unreadCount}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={home.isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        {home.isLoading ? (
          <StateView kind="loading" />
        ) : home.error && !data ? (
          <StateView
            kind="error"
            title={tx('লোড করা যায়নি', 'Could not load')}
            message={home.error}
            actionLabel={tx('আবার চেষ্টা করুন', 'Try again')}
            onAction={home.reload}
          />
        ) : data ? (
          <>
            <View style={styles.section}>
              <View style={styles.padded}>
                <SectionHeader
                  title={tx('আপনার জন্য', 'Recommended for you')}
                  actionLabel={tx('সব দেখুন', 'See all')}
                  onAction={() => (navigation.getParent() as any)?.navigate('ExploreTab')}
                />
                <Text style={styles.hint}>{recommendedHint}</Text>
              </View>
              {data.recommended.length ? (
                shelf(data.recommended)
              ) : (
                <View style={styles.padded}>
                  <StateView
                    kind="empty"
                    compact
                    title={tx('এখনো কোনো অডিওবুক নেই', 'No audiobooks yet')}
                    message={tx('প্রকাশকরা অডিওবুক প্রকাশ করলে এখানে দেখা যাবে।', 'Published audiobooks will appear here.')}
                  />
                </View>
              )}
            </View>

            <View style={[styles.section, styles.padded]}>
              <SectionHeader
                title={tx('সম্প্রতি শোনা', 'Recently played')}
                actionLabel={data.recent.length ? tx('লাইব্রেরি', 'Library') : undefined}
                onAction={data.recent.length ? () => (navigation.getParent() as any)?.navigate('LibraryTab') : undefined}
              />
              {data.recent.length ? (
                data.recent.slice(0, 8).map((item) => (
                  <AudiobookCard
                    key={item.audiobook.id}
                    audiobook={item.audiobook}
                    progressPercent={item.progress_percent}
                    meta={
                      item.progress_percent >= 99
                        ? tx('শেষ হয়েছে', 'Finished')
                        : tx(`${Math.round(item.progress_percent)}% শোনা হয়েছে`, `${Math.round(item.progress_percent)}% listened`)
                    }
                    onPress={() => openBook(item.audiobook)}
                    onPlayPress={() => playBook(item.audiobook)}
                  />
                ))
              ) : (
                <Text style={styles.empty}>
                  {tx('যা শুনবেন তা এখানে অগ্রগতি সহ দেখাবে।', 'What you listen to shows up here with your progress.')}
                </Text>
              )}
            </View>

            {data.feed.length ? (
              <View style={styles.section}>
                <View style={styles.padded}>
                  <SectionHeader title={tx('যাদের ফলো করেন', 'From channels you follow')} />
                </View>
                {shelf(data.feed)}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
  },
  padded: {
    paddingHorizontal: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  hint: {
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  shelf: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  empty: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
