/**
 * ChannelScreen — a verified publisher's channel: everything published lives here.
 *
 * Content enters a channel in two ways:
 * 1. Upload finished MP3 narration (one chapter per file), published right away.
 * 2. Pick one of the user's own generated audiobooks and publish it here.
 */

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { AudiobookCard } from '../../components/AudiobookCard';
import { Field, FormCard, Segmented } from '../../components/Form';
import { ListRow } from '../../components/ListRow';
import { ModalBottomSheet } from '../../components/ModalBottomSheet';
import { StateView } from '../../components/StateView';
import { audiobooksApi } from '../../api/audiobooks';
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

type Sheet = 'upload' | 'add' | 'edit' | null;

export function ChannelScreen() {
  const { navigation } = useAppNavigation();
  const { channelId } = useRoute<RouteProp<ProfileStackParamList, 'Channel'>>().params;
  const { tx } = useLanguage();

  const data = useResource(async () => {
    const [channels, mine] = await Promise.all([publisherApi.channels(), audiobooksApi.listMine()]);
    return { channel: channels.find((c) => c.id === channelId) ?? null, books: mine.items };
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

  const channel = data.data?.channel;
  const books = data.data?.books ?? [];
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
      Alert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(error));
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
      setSheet(null);
      await data.reload();
      Alert.alert(tx('প্রকাশিত হয়েছে', 'Published'), tx(`«${book.title}» এখন চ্যানেলে আছে।`, `“${book.title}” is now live in this channel.`));
    });

  const addExisting = (book: Audiobook) =>
    run(`add:${book.id}`, async () => {
      await audiobooksApi.update(book.id, { channel_id: channelId });
      await audiobooksApi.setVisibility(book.id, 'PUBLIC');
      setSheet(null);
      await data.reload();
    });

  const toggleVisibility = (book: Audiobook) =>
    run(`vis:${book.id}`, async () => {
      await audiobooksApi.setVisibility(book.id, book.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC');
      await data.reload();
    });

  const removeFromChannel = (book: Audiobook) =>
    Alert.alert(book.title, tx('চ্যানেল থেকে সরালে এটি আর প্রকাশিত থাকবে না।', 'Removing it from the channel unpublishes it.'), [
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
                  label={tx('＋ আমার অডিওবুক', '＋ My audiobooks')}
                  variant="secondary"
                  onPress={() => setSheet('add')}
                  disabled={channel.moderated}
                />
              </View>
            </View>
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
          <Segmented
            label={tx('ভাষা', 'Language')}
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'bn', label: 'বাংলা' },
              { value: 'en', label: 'English' },
            ]}
          />
          <Segmented
            label={tx('অ্যাক্সেস', 'Access')}
            value={tier}
            onChange={setTier}
            options={[
              { value: 'free', label: tx('ফ্রি', 'Free') },
              { value: 'premium', label: tx('প্রিমিয়াম', 'Premium') },
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
          <AppButton label={tx('আপলোড ও প্রকাশ', 'Upload & publish')} onPress={upload} isLoading={busy === 'upload'} disabled={!files.length} />
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={sheet === 'add'} onClose={() => setSheet(null)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('আমার অডিওবুক থেকে প্রকাশ', 'Publish one of my audiobooks')}</Text>
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
});
