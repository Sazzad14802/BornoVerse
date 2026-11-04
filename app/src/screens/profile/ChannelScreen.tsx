/**
 * ChannelScreen — the publisher's channel: everything published lives here,
 * organised in playlists (shown on the public channel page).
 *
 * Content enters the channel in two ways, each with an optional
 * "Add to playlist" (or create a new playlist on the spot):
 * 1. Upload finished MP3 narration (one chapter per file), published right away.
 * 2. Pick one of the user's own generated audiobooks and publish it here.
 */

import React, { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { changePicture } from '../../utils/pictureFlow';
import { AppAlert } from '../../components/AppAlert';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AudiobookCard } from '../../components/AudiobookCard';
import { ChoiceCards, Field, FormCard, SelectField } from '../../components/Form';
import { ListRow } from '../../components/ListRow';
import { ModalBottomSheet } from '../../components/ModalBottomSheet';
import { StateView } from '../../components/StateView';
import { audiobooksApi } from '../../api/audiobooks';
import { playlistsApi } from '../../api/library';
import { publisherApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { PickedFile } from '../../api/upload';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { ProfileStackParamList } from '../../navigation/types';
import { AccessTier, Audiobook } from '../../types/audiobook';
import { pickAudioFiles } from '../../utils/pickers';
import { Colors, FontSizes, Spacing } from '../../theme';

type Sheet = 'upload' | 'add' | 'edit' | 'playlist' | null;

export function ChannelScreen() {
  const { navigation } = useAppNavigation();
  const { channelId } = useRoute<RouteProp<ProfileStackParamList, 'Channel'>>().params;
  const { tx } = useLanguage();

  const data = useResource(async () => {
    const [channels, mine, playlists] = await Promise.all([
      publisherApi.channels(),
      audiobooksApi.listMine(),
      playlistsApi.list('channel').catch(() => []),
    ]);
    return { channel: channels.find((c) => c.id === channelId) ?? null, books: mine.items, playlists };
  }, [channelId]);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [tier, setTier] = useState<AccessTier>('free');
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Optional playlist for the audiobook being published; '' means none.
  const [playlistId, setPlaylistId] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [returnTo, setReturnTo] = useState<Sheet>(null);

  const channel = data.data?.channel;
  const books = data.data?.books ?? [];
  const playlists = data.data?.playlists ?? [];
  const playlistOptions = [
    { value: '', label: tx('কোনো প্লেলিস্টে নয়', 'No playlist') },
    ...playlists.map((p) => ({ value: p.id, label: p.name, icon: 'list-outline' as const })),
  ];

  /** Put a just-published audiobook into the chosen playlist (if any). */
  const addToChosenPlaylist = async (bookId: string) => {
    if (playlistId) await playlistsApi.addBook(playlistId, bookId);
  };

  /** Open the new-playlist sheet, then come back to `from` with it selected. */
  const startNewPlaylist = (from: Sheet) => {
    setNewPlaylistName('');
    setReturnTo(from);
    setSheet('playlist');
  };

  const createPlaylist = () =>
    run('playlist', async () => {
      if (!newPlaylistName.trim()) throw new Error(tx('প্লেলিস্টের নাম দিন।', 'Enter a playlist name.'));
      const created = await playlistsApi.create(newPlaylistName.trim(), true);
      await data.reload();
      setPlaylistId(created.id);
      setSheet(returnTo);
    });

  const playlistPicker = (from: Sheet) => (
    <View style={styles.playlistPicker}>
      <SelectField
        label={tx('প্লেলিস্টে যোগ করুন (ঐচ্ছিক)', 'Add to playlist (optional)')}
        placeholder={tx('কোনো প্লেলিস্টে নয়', 'No playlist')}
        value={playlistId}
        onChange={setPlaylistId}
        options={playlistOptions}
      />
      <AppButton label={tx('নতুন প্লেলিস্ট', 'New playlist')} icon="add" variant="text" fullWidth={false} onPress={() => startNewPlaylist(from)} />
    </View>
  );
  const channelBooks = useMemo(() => books.filter((b) => b.channel_id === channelId), [books, channelId]);
  // Own finished audiobooks that are not in any channel yet.
  const candidates = useMemo(
    () => books.filter((b) => !b.channel_id && b.status === 'COMPLETED' && !b.moderated),
    [books],
  );

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      AppAlert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const openUpload = () => {
    setTitle('');
    setAuthor('');
    setTier('free');
    setLanguage('bn');
    setFiles([]);
    setPlaylistId('');
    setSheet('upload');
  };

  const openEdit = () => {
    setName(channel?.name ?? '');
    setDescription(channel?.description ?? '');
    setSheet('edit');
  };

  const chooseFiles = () =>
    run('pick', async () => {
      const picked = await pickAudioFiles();
      if (picked.length) setFiles(picked);
    });

  const upload = () =>
    run('upload', async () => {
      if (!title.trim()) throw new Error(tx('শিরোনাম দিন।', 'Enter a title.'));
      if (!files.length) throw new Error(tx('অন্তত একটি MP3 বেছে নিন।', 'Choose at least one MP3.'));
      const book = await audiobooksApi.create({
        title: title.trim(),
        author: author.trim() || undefined,
        language,
        access_tier: tier,
        channel_id: channelId,
        visibility: 'PRIVATE',
      });
      await audiobooksApi.uploadAudio(book.id, files);
      await audiobooksApi.setVisibility(book.id, 'PUBLIC');
      await addToChosenPlaylist(book.id);
      setSheet(null);
      await data.reload();
      AppAlert.alert(tx('প্রকাশিত হয়েছে', 'Published'), tx(`«${book.title}» এখন চ্যানেলে আছে।`, `“${book.title}” is now live in this channel.`));
    });

  const addExisting = (book: Audiobook) =>
    run(`add:${book.id}`, async () => {
      await audiobooksApi.update(book.id, { channel_id: channelId });
      await audiobooksApi.setVisibility(book.id, 'PUBLIC');
      await addToChosenPlaylist(book.id);
      setSheet(null);
      await data.reload();
    });

  const toggleVisibility = (book: Audiobook) =>
    run(`vis:${book.id}`, async () => {
      await audiobooksApi.setVisibility(book.id, book.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC');
      await data.reload();
    });

  const removeFromChannel = (book: Audiobook) =>
    AppAlert.alert(book.title, tx('চ্যানেল থেকে সরালে এটি আর প্রকাশিত থাকবে না।', 'Removing it from the channel unpublishes it.'), [
      { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
      {
        text: tx('সরান', 'Remove'),
        style: 'destructive',
        onPress: () =>
          run(`remove:${book.id}`, async () => {
            await audiobooksApi.update(book.id, { channel_id: null });
            await data.reload();
          }),
      },
    ]);

  const saveChannel = () =>
    run('edit', async () => {
      if (!name.trim()) throw new Error(tx('চ্যানেলের নাম দিন।', 'Enter a channel name.'));
      await publisherApi.updateChannel(channelId, name.trim(), description.trim());
      setSheet(null);
      await data.reload();
    });

  const meta = (book: Audiobook) => {
    const status =
      book.status !== 'COMPLETED'
        ? tx('অডিও তৈরি হচ্ছে', 'Audio not ready')
        : book.visibility === 'PUBLIC'
          ? tx('প্রকাশিত', 'Published')
          : tx('অপ্রকাশিত', 'Unpublished');
    const access = book.access_tier === 'premium' ? tx(' · প্রিমিয়াম', ' · Premium') : '';
    return `${status}${access}${book.moderated ? ` · ${tx('সীমিত', 'Restricted')}` : ''}`;
  };

  if (!channel) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader title={tx('চ্যানেল', 'Channel')} onBack={() => navigation.goBack()} />
        {data.isLoading ? (
          <StateView kind="loading" />
        ) : (
          <StateView
            kind="error"
            message={data.error ?? tx('চ্যানেলটি পাওয়া যায়নি।', 'Channel not found.')}
            actionLabel={tx('আবার চেষ্টা', 'Retry')}
            onAction={data.reload}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={channel.name}
        subtitle={tx(`${channelBooks.length}টি অডিওবুক`, `${channelBooks.length} audiobooks`)}
        onBack={() => navigation.goBack()}
        rightActionText={tx('সম্পাদনা', 'Edit')}
        onRightAction={openEdit}
      />
      <FlatList
        data={channelBooks}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={data.refresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <Pressable
                onPress={() =>
                  changePicture({
                    tx,
                    title: tx('চ্যানেলের লোগো', 'Channel logo'),
                    hasPicture: !!channel.avatar_url,
                    upload: async (file) => {
                      await publisherApi.uploadChannelAvatar(channel.id, file);
                      await data.reload();
                    },
                    remove: async () => {
                      await publisherApi.removeChannelAvatar(channel.id);
                      await data.reload();
                    },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={tx('চ্যানেলের লোগো বদলান', 'Change channel logo')}
              >
                <Avatar name={channel.name} uri={channel.avatar_url} size={64} editable />
              </Pressable>
              <Text style={styles.logoHint}>
                {tx('লোগোতে চাপ দিয়ে চ্যানেলের ছবি বদলান। শ্রোতারা এটি দেখবেন।', 'Tap the logo to change the channel picture listeners see.')}
              </Text>
            </View>
            {channel.moderated ? (
              <View style={styles.restricted}>
                <Text style={styles.restrictedText}>
                  {tx('এই চ্যানেলটি অ্যাডমিন সীমিত করেছেন; এর অডিওবুক প্রকাশিত দেখাবে না।', 'An administrator restricted this channel; its audiobooks are hidden from listeners.')}
                </Text>
              </View>
            ) : null}
            {channel.description ? <Text style={styles.description}>{channel.description}</Text> : null}
            <View style={styles.actions}>
              <View style={styles.flex}>
                <AppButton label={tx('MP3 আপলোড', 'Upload MP3s')} onPress={openUpload} disabled={channel.moderated} />
              </View>
              <View style={styles.flex}>
                <AppButton
                  label={tx('আমার অডিওবুক', 'My audiobooks')}
                  icon="add"
                  variant="secondary"
                  onPress={() => {
                    setPlaylistId('');
                    setSheet('add');
                  }}
                  disabled={channel.moderated}
                />
              </View>
            </View>

            <View style={styles.playlistsHeader}>
              <Text style={styles.sectionTitle}>{tx('প্লেলিস্ট', 'Playlists')}</Text>
              <AppButton label={tx('নতুন', 'New')} icon="add" variant="text" fullWidth={false} onPress={() => startNewPlaylist(null)} />
            </View>
            {playlists.length ? (
              <FormCard style={styles.candidates}>
                {playlists.map((p, i) => (
                  <ListRow
                    key={p.id}
                    icon="list-outline"
                    title={p.name}
                    subtitle={tx(`${p.count ?? 0}টি অডিওবুক`, `${p.count ?? 0} audiobooks`)}
                    onPress={() => navigation.navigate('PlaylistDetails', { playlistId: p.id, name: p.name })}
                    last={i === playlists.length - 1}
                  />
                ))}
              </FormCard>
            ) : (
              <Text style={styles.hint}>
                {tx('প্লেলিস্ট দিয়ে অডিওবুক সাজান; শ্রোতারা চ্যানেল পেজে দেখবে।', 'Group audiobooks into playlists; listeners see them on your channel page.')}
              </Text>
            )}
            <Text style={styles.sectionTitle}>{tx('অডিওবুক', 'Audiobooks')}</Text>
          </View>
        }
        ListEmptyComponent={
          data.isLoading ? (
            <StateView kind="loading" />
          ) : (
            <StateView
              kind="empty"
              title={tx('চ্যানেলে এখনো কিছু নেই', 'Nothing in this channel yet')}
              message={tx('MP3 আপলোড করুন বা আপনার তৈরি অডিওবুক যোগ করুন।', 'Upload MP3s or add one of your generated audiobooks.')}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <AudiobookCard
              audiobook={item}
              meta={meta(item)}
              onPress={() =>
                item.status === 'COMPLETED'
                  ? navigation.navigate('Player', { audiobookId: item.id })
                  : navigation.navigate('GenerationStatus', { audiobookId: item.id })
              }
            />
            <View style={styles.itemActions}>
              {item.status === 'COMPLETED' && !item.moderated ? (
                <AppButton
                  label={item.visibility === 'PUBLIC' ? tx('অপ্রকাশ করুন', 'Unpublish') : tx('প্রকাশ করুন', 'Publish')}
                  variant="outline"
                  fullWidth={false}
                  isLoading={busy === `vis:${item.id}`}
                  onPress={() => toggleVisibility(item)}
                />
              ) : null}
              <AppButton
                label={tx('সম্পাদনা', 'Edit')}
                variant="outline"
                fullWidth={false}
                onPress={() => navigation.navigate('EditAudiobook', { audiobookId: item.id })}
              />
              <AppButton
                label={tx('সরান', 'Remove')}
                variant="outline"
                fullWidth={false}
                isLoading={busy === `remove:${item.id}`}
                onPress={() => removeFromChannel(item)}
              />
            </View>
          </View>
        )}
      />

      <ModalBottomSheet visible={sheet === 'upload'} onClose={() => setSheet(null)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('MP3 আপলোড করে প্রকাশ', 'Upload MP3s & publish')}</Text>
          <Field label={tx('শিরোনাম', 'Title')} required value={title} onChangeText={setTitle} maxLength={255} />
          <Field label={tx('লেখক', 'Author')} value={author} onChangeText={setAuthor} maxLength={255} />
          <ChoiceCards
            label={tx('ভাষা', 'Language')}
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'bn', label: 'বাংলা', icon: 'language-outline' },
              { value: 'en', label: 'English', icon: 'language-outline' },
            ]}
          />
          <ChoiceCards
            label={tx('অ্যাক্সেস', 'Access')}
            value={tier}
            onChange={setTier}
            options={[
              { value: 'free', label: tx('ফ্রি', 'Free'), icon: 'lock-open-outline', description: tx('সবাই শুনতে পারবে', 'Everyone can listen') },
              { value: 'premium', label: tx('প্রিমিয়াম', 'Premium'), icon: 'diamond-outline', description: tx('শুধু প্রিমিয়াম শ্রোতা', 'Premium listeners only') },
            ]}
            hint={tier === 'premium' ? tx('প্রিমিয়াম শ্রোতাদের যোগ্য শোনা থেকে আয় হয়।', 'Earns revenue from eligible premium listens.') : undefined}
          />
          <AppButton
            label={files.length ? tx(`${files.length}টি MP3 বেছে নেওয়া হয়েছে`, `${files.length} MP3 selected`) : tx('MP3 ফাইল বেছে নিন', 'Choose MP3 files')}
            variant="secondary"
            onPress={chooseFiles}
          />
          {files.length ? (
            <Text style={styles.hint}>
              {tx('প্রতিটি ফাইল একটি অধ্যায় হবে, এই ক্রমে:', 'Each file becomes a chapter, in this order:')}{'\n'}
              {files.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}
            </Text>
          ) : null}
          {playlistPicker('upload')}
          <AppButton label={tx('আপলোড ও প্রকাশ', 'Upload & publish')} onPress={upload} isLoading={busy === 'upload'} disabled={!files.length} />
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={sheet === 'add'} onClose={() => setSheet(null)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('আমার অডিওবুক থেকে প্রকাশ', 'Publish one of my audiobooks')}</Text>
          {candidates.length ? playlistPicker('add') : null}
          {candidates.length ? (
            <FormCard style={styles.candidates}>
              {candidates.map((book, i) => (
                <ListRow
                  key={book.id}
                  icon="headset-outline"
                  title={book.title}
                  subtitle={busy === `add:${book.id}` ? tx('প্রকাশ হচ্ছে…', 'Publishing…') : book.author ?? undefined}
                  onPress={busy ? undefined : () => addExisting(book)}
                  last={i === candidates.length - 1}
                />
              ))}
            </FormCard>
          ) : (
            <Text style={styles.hint}>
              {tx(
                'যোগ করার মতো কিছু নেই। তৈরি সম্পন্ন হয়েছে এমন, কোনো চ্যানেলে নেই এমন অডিওবুক এখানে দেখাবে।',
                'Nothing to add. Your finished audiobooks that are not in a channel appear here.',
              )}
            </Text>
          )}
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={sheet === 'playlist'} onClose={() => setSheet(returnTo)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('নতুন প্লেলিস্ট', 'New playlist')}</Text>
          <Field
            label={tx('নাম', 'Name')}
            required
            value={newPlaylistName}
            onChangeText={setNewPlaylistName}
            placeholder={tx('যেমন: রবীন্দ্র রচনা', 'e.g. Tagore collection')}
            maxLength={150}
            autoFocus
          />
          <AppButton label={tx('তৈরি করুন', 'Create playlist')} onPress={createPlaylist} isLoading={busy === 'playlist'} />
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={sheet === 'edit'} onClose={() => setSheet(null)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('চ্যানেল সম্পাদনা', 'Edit channel')}</Text>
          <Field label={tx('নাম', 'Name')} required value={name} onChangeText={setName} maxLength={150} />
          <Field label={tx('বিবরণ', 'Description')} value={description} onChangeText={setDescription} multiline maxLength={5000} />
          <AppButton label={tx('সংরক্ষণ', 'Save')} onPress={saveChannel} isLoading={busy === 'edit'} />
        </View>
      </ModalBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logoHint: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  restricted: {
    backgroundColor: Colors.tintError,
    borderRadius: 12,
    padding: Spacing.md,
  },
  restrictedText: {
    fontSize: FontSizes.sm,
    color: Colors.tintErrorText,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  item: {
    gap: Spacing.xs,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  sheet: {
    gap: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hint: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  candidates: {
    gap: Spacing.xs,
  },
  playlistsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  playlistPicker: {
    gap: 2,
    alignItems: 'flex-start',
  },
});
