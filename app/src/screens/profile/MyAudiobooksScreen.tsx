/**
 * MyAudiobooksScreen — audiobooks the user owns, with their generation state
 * Tap opens it (or its generation progress); press and hold opens a menu with
 * publish/unpublish, edit and delete.
 */

import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalBottomSheet } from '../../components/ModalBottomSheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AudiobookCard } from '../../components/AudiobookCard';
import { StateView } from '../../components/StateView';
import { audiobooksApi } from '../../api/audiobooks';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { isActivePublisher } from '../../types/auth';
import { Audiobook } from '../../types/audiobook';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

export function MyAudiobooksScreen() {
  const { navigation, goToTab } = useAppNavigation();
  const { loadAudiobook } = usePlayer();
  const { user } = useAuth();
  const { tx } = useLanguage();
  const canPublish = isActivePublisher(user);
  const books = useResource(() => audiobooksApi.listMine().then((r) => r.items));
  const [menuFor, setMenuFor] = useState<Audiobook | null>(null);

  const replace = (book: Audiobook) =>
    books.setData((current) => (current ?? []).map((b) => (b.id === book.id ? book : b)));

  const toggleVisibility = async (book: Audiobook) => {
    try {
      replace(await audiobooksApi.setVisibility(book.id, book.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC'));
    } catch (error) {
      Alert.alert(tx('পরিবর্তন হয়নি', 'Not changed'), errorMessage(error));
    }
  };

  const remove = (book: Audiobook) =>
    Alert.alert(book.title, tx('এই অডিওবুকটি মুছবেন?', 'Delete this audiobook?'), [
      { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
      {
        text: tx('মুছুন', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await audiobooksApi.delete(book.id);
            books.setData((current) => (current ?? []).filter((b) => b.id !== book.id));
          } catch (error) {
            Alert.alert(tx('মুছা যায়নি', 'Could not delete'), errorMessage(error));
          }
        },
      },
    ]);

  const play = async (book: Audiobook) => {
    try {
      await loadAudiobook(book);
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (error) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(error));
    }
  };

  const meta = (book: Audiobook) => {
    const visibility = book.visibility === 'PUBLIC' ? tx('পাবলিক', 'Public') : tx('প্রাইভেট', 'Private');
    const status = {
      COMPLETED: tx('প্রস্তুত', 'Ready'),
      PROCESSING: tx('তৈরি হচ্ছে', 'Generating'),
      PENDING: book.source_file_url ? tx('কিউতে', 'Queued') : tx('ফাইল বাকি', 'Needs a file'),
      FAILED: tx('ব্যর্থ', 'Failed'),
    }[book.status];
    return `${status} · ${visibility}${book.moderated ? ` · ${tx('সীমিত', 'Restricted')}` : ''}`;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('আমার অডিওবুক', 'My audiobooks')}
        onBack={() => navigation.goBack()}
        rightActionText={tx('+ নতুন', '+ New')}
        onRightAction={() => goToTab('CreateTab', { screen: 'CreateAudiobook' })}
      />
      <FlatList
        data={books.data ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={books.isRefreshing} onRefresh={books.refresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          books.isLoading ? (
            <StateView kind="loading" />
          ) : books.error ? (
            <StateView kind="error" message={books.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={books.reload} />
          ) : (
            <StateView
              kind="empty"
              title={tx('এখনো কোনো অডিওবুক নেই', 'No audiobooks yet')}
              message={tx('PDF থেকে প্রথম অডিওবুক তৈরি করুন।', 'Create your first audiobook from a PDF.')}
              actionLabel={tx('তৈরি করুন', 'Create')}
              onAction={() => goToTab('CreateTab', { screen: 'CreateAudiobook' })}
            />
          )
        }
        ListHeaderComponent={
          (books.data?.length ?? 0) > 0 ? (
            <Text style={styles.hint}>{tx('অপশনের জন্য অডিওবুক চেপে ধরে রাখুন', 'Press and hold an audiobook for options')}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <AudiobookCard
              onLongPress={() => setMenuFor(item)}
              audiobook={item}
              meta={meta(item)}
              onPress={() =>
                item.status === 'COMPLETED'
                  ? navigation.navigate('Player', { audiobookId: item.id })
                  : item.source_file_url
                    ? navigation.navigate('GenerationStatus', { audiobookId: item.id })
                    : goToTab('CreateTab', { screen: 'UploadSource', params: { audiobookId: item.id, title: item.title } })
              }
              onPlayPress={() => play(item)}
            />
          </View>
        )}
        ListFooterComponent={
          !canPublish && (books.data?.length ?? 0) > 0 ? (
            <Text style={styles.note}>
              {tx('আপনার অডিওবুক প্রাইভেট থাকে। প্রকাশ করতে প্রকাশক হিসেবে যাচাই করুন।', 'Your audiobooks stay private. Get verified as a publisher to publish them.')}
            </Text>
          ) : null
        }
      />

      <ModalBottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        {menuFor ? (
          <View style={styles.menu}>
            <Text style={styles.menuTitle} numberOfLines={2}>
              {menuFor.title}
            </Text>
            <Text style={styles.menuMeta}>{meta(menuFor)}</Text>
            {canPublish && menuFor.channel_id && menuFor.status === 'COMPLETED' && !menuFor.moderated ? (
              <MenuRow
                icon={menuFor.visibility === 'PUBLIC' ? 'eye-off-outline' : 'globe-outline'}
                label={menuFor.visibility === 'PUBLIC' ? tx('প্রাইভেট করুন', 'Make private') : tx('প্রকাশ করুন', 'Publish')}
                onPress={() => {
                  const book = menuFor;
                  setMenuFor(null);
                  toggleVisibility(book);
                }}
              />
            ) : null}
            <MenuRow
              icon="create-outline"
              label={tx('সম্পাদনা', 'Edit')}
              onPress={() => {
                const id = menuFor.id;
                setMenuFor(null);
                navigation.navigate('EditAudiobook', { audiobookId: id });
              }}
            />
            <MenuRow
              icon="trash-outline"
              label={tx('মুছুন', 'Delete')}
              destructive
              onPress={() => {
                const book = menuFor;
                setMenuFor(null);
                remove(book);
              }}
            />
          </View>
        ) : null}
      </ModalBottomSheet>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? Colors.error : Colors.textPrimary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.menuText, { color }]}>{label}</Text>
    </Pressable>
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
    gap: Spacing.sm,
    flexGrow: 1,
  },
  item: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
    paddingBottom: Spacing.sm,
  },
  hint: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  menu: {
    gap: 2,
    paddingTop: Spacing.xs,
  },
  menuTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  menuMeta: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
  },
  menuText: {
    fontSize: FontSizes.base,
    fontWeight: '500',
  },
  pressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  note: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
});
