/**
 * ChannelProfileScreen — a channel's public page, like a YouTube channel:
 * name, followers, Follow + bell, description, and its audiobooks and playlists.
 */

import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AudiobookCard } from '../../components/AudiobookCard';
import { CoverTile } from '../../components/CoverTile';
import { FollowButton } from '../../components/FollowButton';
import { StateView } from '../../components/StateView';
import { socialApi } from '../../api/social';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { SharedStackParamList } from '../../navigation/types';
import { Audiobook } from '../../types/audiobook';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Tab = 'audiobooks' | 'playlists';

export function ChannelProfileScreen() {
  const { navigation } = useAppNavigation();
  const { channelId } = useRoute<RouteProp<SharedStackParamList, 'ChannelProfile'>>().params;
  const { loadAudiobook } = usePlayer();
  const { tx } = useLanguage();
  const page = useResource(() => socialApi.channel(channelId), [channelId]);
  const [tab, setTab] = useState<Tab>('audiobooks');

  const open = (book: Audiobook) => navigation.navigate('Player', { audiobookId: book.id });
  const play = async (book: Audiobook) => {
    try {
      await loadAudiobook(book);
      open(book);
    } catch (error) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(error));
    }
  };

  const channel = page.data;
  if (!channel) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader title={tx('চ্যানেল', 'Channel')} onBack={() => navigation.goBack()} />
        {page.error ? (
          <StateView kind="error" message={page.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={page.reload} />
        ) : (
          <StateView kind="loading" />
        )}
      </SafeAreaView>
    );
  }

  const books = channel.audiobook_items ?? [];
  const playlists = (channel.playlists ?? []).filter((p) => p.audiobooks.length);
  const initials = channel.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const header = (
    <View>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{channel.name}</Text>
        <Text style={styles.meta}>
          {tx(
            `${channel.followers} জন ফলোয়ার · ${channel.audiobooks}টি অডিওবুক`,
            `${channel.followers} ${channel.followers === 1 ? 'follower' : 'followers'} · ${channel.audiobooks} audiobooks`,
          )}
        </Text>
        <FollowButton channel={channel} onChange={(next) => page.setData((current) => ({ ...(current ?? next), ...next }))} />
        {channel.description ? <Text style={styles.description}>{channel.description}</Text> : null}
      </View>

      <View style={styles.tabs}>
        {(['audiobooks', 'playlists'] as Tab[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {key === 'audiobooks' ? tx('অডিওবুক', 'Audiobooks') : tx('প্লেলিস্ট', 'Playlists')}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={channel.name} onBack={() => navigation.goBack()} />
      <FlatList
        data={tab === 'audiobooks' ? books : []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={page.isRefreshing} onRefresh={page.refresh} tintColor={Colors.primary} />}
        renderItem={({ item }) => <AudiobookCard audiobook={item} onPress={() => open(item)} onPlayPress={() => play(item)} />}
        ListEmptyComponent={
          tab === 'playlists' ? (
            playlists.length ? (
              <View style={styles.playlists}>
                {playlists.map((playlist) => (
                  <View key={playlist.id} style={styles.playlist}>
                    <Text style={styles.playlistTitle}>
                      {playlist.name} <Text style={styles.playlistCount}>· {playlist.audiobooks.length}</Text>
                    </Text>
                    <FlatList
                      horizontal
                      data={playlist.audiobooks}
                      keyExtractor={(b) => b.id}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.shelf}
                      renderItem={({ item }) => (
                        <CoverTile audiobook={item} width={120} onPress={() => open(item)} onPlayPress={() => play(item)} />
                      )}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <StateView kind="empty" compact title={tx('কোনো প্লেলিস্ট নেই', 'No playlists yet')} />
            )
          ) : (
            <StateView kind="empty" compact title={tx('এখনো কোনো অডিওবুক নেই', 'No audiobooks yet')} />
          )
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
  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSizes['2xl'],
    fontWeight: '700',
    color: Colors.textOnPrimary,
  },
  name: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  meta: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  playlists: {
    gap: Spacing.lg,
  },
  playlist: {
    gap: Spacing.sm,
  },
  playlistTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  playlistCount: {
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  shelf: {
    gap: Spacing.md,
  },
});
