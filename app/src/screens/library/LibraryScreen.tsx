/**
 * LibraryScreen — the user's own collections in four tabs:
 * saved audiobooks, playlists, offline downloads, and audiobooks they created.
 */

import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AudiobookCard } from '../../components/AudiobookCard';
import { ChipGroup } from '../../components/Chip';
import { StateView } from '../../components/StateView';
import { ModalBottomSheet } from '../../components/ModalBottomSheet';
import { AppButton } from '../../components/AppButton';
import { libraryApi, playlistsApi } from '../../api/library';
import { audiobooksApi } from '../../api/audiobooks';
import { errorMessage } from '../../api/client';
import { offline } from '../../storage/offline';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { Audiobook } from '../../types/audiobook';
import { Playlist } from '../../types/domain';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Tab = 'saved' | 'playlists' | 'downloads' | 'mine';

export function LibraryScreen() {
  const { navigation, goToTab } = useAppNavigation();
  const { loadAudiobook, loadOffline } = usePlayer();
  const { user } = useAuth();
  const { t, tx } = useLanguage();
  const [tab, setTab] = useState<Tab>('saved');
  const [playlistSheet, setPlaylistSheet] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);

  const library = useResource(async () => {
    const [saved, playlists, downloads, mine] = await Promise.all([
      libraryApi.list().then((r) => r.items.map((i) => i.audiobook)),
      playlistsApi.list(),
      user ? offline.list(user.id).catch(() => []) : Promise.resolve([]),
      audiobooksApi.listMine().then((r) => r.items),
    ]);
    return { saved, playlists, downloads, mine };
  }, [user?.id]);

  const data = library.data;

  const openBook = (book: Audiobook) => navigation.navigate('Player', { audiobookId: book.id });

  const play = async (book: Audiobook, fromDownload = false) => {
    try {
      if (fromDownload && user) await loadOffline(book, await offline.open(book.id, user.id));
      else await loadAudiobook(book);
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (error) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(error));
    }
  };

  const createPlaylist = async () => {
    const name = playlistName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await playlistsApi.create(name);
      library.setData((current) => ({ ...current!, playlists: [...current!.playlists, created] }));
      setPlaylistName('');
      setPlaylistSheet(false);
    } catch (error) {
      Alert.alert(tx('প্লেলিস্ট', 'Playlist'), errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const statusMeta = (book: Audiobook) => {
    switch (book.status) {
      case 'COMPLETED':
        return book.visibility === 'PUBLIC' ? tx('প্রকাশিত', 'Published') : tx('প্রস্তুত · প্রাইভেট', 'Ready · Private');
      case 'FAILED':
        return tx('ব্যর্থ — আবার চেষ্টা করুন', 'Failed — tap to retry');
      case 'PROCESSING':
        return tx('তৈরি হচ্ছে…', 'Generating…');
      default:
        return book.source_file_url ? tx('কিউতে আছে', 'Queued') : tx('ফাইল আপলোড বাকি', 'Upload pending');
    }
  };

  const empty = {
    saved: {
      title: tx('কিছু সেভ করা নেই', 'Nothing saved yet'),
      message: tx('অডিওবুকের পাতায় “সেভ” চাপলে এখানে দেখা যাবে।', 'Tap “Save” on an audiobook to keep it here.'),
      action: tx('অডিওবুক খুঁজুন', 'Browse audiobooks'),
      onAction: () => goToTab('ExploreTab', { screen: 'Explore' }),
    },
    playlists: {
      title: tx('কোনো প্লেলিস্ট নেই', 'No playlists yet'),
      message: tx('নিজের মতো করে অডিওবুক সাজিয়ে রাখুন।', 'Group audiobooks your own way.'),
      action: tx('প্লেলিস্ট তৈরি করুন', 'Create a playlist'),
      onAction: () => setPlaylistSheet(true),
    },
    downloads: {
      title: tx('কোনো ডাউনলোড নেই', 'No downloads'),
      message: tx('প্রিমিয়াম সদস্যরা অডিওবুক ডাউনলোড করে অফলাইনে শুনতে পারেন।', 'Premium members can download audiobooks to listen offline.'),
      action: undefined,
      onAction: undefined,
    },
    mine: {
      title: tx('আপনি এখনো কিছু তৈরি করেননি', 'You have not created anything yet'),
      message: tx('PDF আপলোড করে নিজের অডিওবুক তৈরি করুন।', 'Upload a PDF to create your own audiobook.'),
      action: tx('অডিওবুক তৈরি করুন', 'Create an audiobook'),
      onAction: () => goToTab('CreateTab', { screen: 'CreateAudiobook' }),
    },
  }[tab];

  const books: Audiobook[] = data ? (tab === 'saved' ? data.saved : tab === 'downloads' ? data.downloads : tab === 'mine' ? data.mine : []) : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('tabLibrary')}
        subtitle={tx('আপনার সংগ্রহ', 'Your collection')}
        rightActionText={tab === 'playlists' ? tx('+ নতুন', '+ New') : undefined}
        onRightAction={tab === 'playlists' ? () => setPlaylistSheet(true) : undefined}
      />

      <View style={styles.tabs}>
        <ChipGroup
          scrollable
          value={tab}
          onChange={setTab}
          options={[
            { value: 'saved', label: `${tx('সেভ করা', 'Saved')}${data ? ` · ${data.saved.length}` : ''}` },
            { value: 'playlists', label: `${tx('প্লেলিস্ট', 'Playlists')}${data ? ` · ${data.playlists.length}` : ''}` },
            { value: 'downloads', label: `${tx('ডাউনলোড', 'Downloads')}${data ? ` · ${data.downloads.length}` : ''}` },
            { value: 'mine', label: `${tx('আমার তৈরি', 'My creations')}${data ? ` · ${data.mine.length}` : ''}` },
          ]}
        />
      </View>

      {library.isLoading ? (
        <StateView kind="loading" />
      ) : library.error && !data ? (
        <StateView kind="error" message={library.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={library.reload} />
      ) : tab === 'playlists' ? (
        <FlatList<Playlist>
          data={data?.playlists ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={library.isRefreshing} onRefresh={library.refresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <StateView kind="empty" title={empty.title} message={empty.message} actionLabel={empty.action} onAction={empty.onAction} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.playlistRow, pressed && styles.pressed]}
              onPress={() => navigation.navigate('PlaylistDetails', { playlistId: item.id, name: item.name })}
            >
              <View style={styles.playlistIcon}>
                <Ionicons name="musical-notes-outline" size={22} color={Colors.tintBlueText} />
              </View>
              <Text style={styles.playlistName} numberOfLines={1}>
                {item.name}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList<Audiobook>
          data={books}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={library.isRefreshing} onRefresh={library.refresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <StateView kind="empty" title={empty.title} message={empty.message} actionLabel={empty.action} onAction={empty.onAction} />
          }
          renderItem={({ item }) =>
            tab === 'mine' ? (
              <AudiobookCard
                audiobook={item}
                meta={statusMeta(item)}
                onPress={() =>
                  item.status === 'COMPLETED' || !item.source_file_url
                    ? openBook(item)
                    : navigation.navigate('GenerationStatus', { audiobookId: item.id })
                }
                onPlayPress={() => play(item)}
              />
            ) : (
              <AudiobookCard
                audiobook={item}
                meta={tab === 'downloads' ? tx('অফলাইনে উপলব্ধ', 'Available offline') : undefined}
                onPress={() => (tab === 'downloads' ? play(item, true) : openBook(item))}
                onPlayPress={() => play(item, tab === 'downloads')}
              />
            )
          }
        />
      )}

      <ModalBottomSheet visible={playlistSheet} onClose={() => setPlaylistSheet(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('নতুন প্লেলিস্ট', 'New playlist')}</Text>
          <TextInput
            style={styles.input}
            value={playlistName}
            onChangeText={setPlaylistName}
            placeholder={tx('প্লেলিস্টের নাম', 'Playlist name')}
            placeholderTextColor={Colors.textMuted}
            maxLength={150}
            autoFocus
          />
          <AppButton label={tx('তৈরি করুন', 'Create')} onPress={createPlaylist} isLoading={creating} disabled={!playlistName.trim()} />
        </View>
      </ModalBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabs: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  playlistIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.tintBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistName: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sheet: {
    gap: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  input: {
    height: 48,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
});
