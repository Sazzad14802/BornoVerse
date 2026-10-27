/**
 * EditAudiobookScreen — owner edits metadata and cover; active publishers also
 * set access tier and channel. Visibility is changed from My audiobooks.
 */

import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { BookCover } from '../../components/BookCover';
import { ChipGroup } from '../../components/Chip';
import { Field, FormCard, Segmented } from '../../components/Form';
import { StateView } from '../../components/StateView';
import { audiobooksApi } from '../../api/audiobooks';
import { publisherApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { ProfileStackParamList } from '../../navigation/types';
import { GENRES } from '../../constants/genres';
import { isActivePublisher } from '../../types/auth';
import { AccessTier } from '../../types/audiobook';
import { pickCoverImage } from '../../utils/pickers';
import { Colors, FontSizes, Spacing } from '../../theme';

export function EditAudiobookScreen() {
  const { navigation } = useAppNavigation();
  const { audiobookId } = useRoute<RouteProp<ProfileStackParamList, 'EditAudiobook'>>().params;
  const { user } = useAuth();
  const { tx, isEnglish } = useLanguage();
  const canPublish = isActivePublisher(user);

  const data = useResource(async () => {
    const [book, channels] = await Promise.all([
      audiobooksApi.get(audiobookId),
      canPublish ? publisherApi.channels() : Promise.resolve([]),
    ]);
    return { book, channels };
  }, [audiobookId]);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [tier, setTier] = useState<AccessTier>('free');
  const [channelId, setChannelId] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const loaded = data.data?.book;

  useEffect(() => {
    if (!loaded) return;
    setTitle(loaded.title);
    setAuthor(loaded.author ?? '');
    setDescription(loaded.description ?? '');
    setGenre(loaded.genre ?? '');
    setTier(loaded.access_tier);
    setChannelId(loaded.channel_id ?? '');
    setCoverUri(loaded.cover_image_url);
  }, [loaded?.id]);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader title={tx('সম্পাদনা', 'Edit')} onBack={() => navigation.goBack()} />
        {data.error ? <StateView kind="error" message={data.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={data.reload} /> : <StateView kind="loading" />}
      </SafeAreaView>
    );
  }

  const changeCover = async () => {
    try {
      const picked = await pickCoverImage();
      if (!picked) return;
      setUploadingCover(true);
      const updated = await audiobooksApi.uploadCover(loaded.id, picked);
      setCoverUri(updated.cover_image_url);
    } catch (error) {
      Alert.alert(tx('কভার', 'Cover'), errorMessage(error));
    } finally {
      setUploadingCover(false);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert(tx('শিরোনাম দিন', 'Enter a title'));
      return;
    }
    setSaving(true);
    try {
      await audiobooksApi.update(loaded.id, {
        title: title.trim(),
        author: author.trim(),
        description: description.trim(),
        genre: genre || undefined,
        ...(canPublish ? { access_tier: tier, channel_id: channelId || null } : {}),
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert(tx('সংরক্ষণ হয়নি', 'Not saved'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('অডিওবুক সম্পাদনা', 'Edit audiobook')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.coverRow} onPress={changeCover} accessibilityRole="button">
            <BookCover title={title || loaded.title} uri={coverUri} size={96} />
            <Text style={styles.coverAction}>{uploadingCover ? tx('আপলোড হচ্ছে…', 'Uploading…') : tx('কভার পরিবর্তন করুন', 'Change cover')}</Text>
          </Pressable>

          <FormCard>
            <Field label={tx('শিরোনাম', 'Title')} required value={title} onChangeText={setTitle} maxLength={255} />
            <Field label={tx('লেখক', 'Author')} value={author} onChangeText={setAuthor} maxLength={255} />
            <Field label={tx('বিবরণ', 'Description')} value={description} onChangeText={setDescription} multiline maxLength={2000} />
            <View style={styles.field}>
              <Text style={styles.label}>{tx('ধরন', 'Genre')}</Text>
              <ChipGroup
                scrollable
                value={genre}
                onChange={setGenre}
                options={[{ value: '', label: tx('নেই', 'None') }, ...GENRES.map((g) => ({ value: g.key, label: isEnglish ? g.en : g.bn }))]}
              />
            </View>
          </FormCard>

          {canPublish ? (
            <FormCard>
              <Segmented
                label={tx('অ্যাক্সেস', 'Access')}
                value={tier}
                onChange={setTier}
                options={[
                  { value: 'free', label: tx('ফ্রি', 'Free') },
                  { value: 'premium', label: tx('প্রিমিয়াম', 'Premium') },
                ]}
              />
              {data.data?.channels.length ? (
                <View style={styles.field}>
                  <Text style={styles.label}>{tx('চ্যানেল', 'Channel')}</Text>
                  <ChipGroup
                    scrollable
                    value={channelId}
                    onChange={setChannelId}
                    options={[{ value: '', label: tx('কোনোটি নয়', 'None') }, ...data.data.channels.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </View>
              ) : null}
            </FormCard>
          ) : null}

          <AppButton label={tx('সংরক্ষণ করুন', 'Save changes')} onPress={save} isLoading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  coverRow: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  coverAction: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
