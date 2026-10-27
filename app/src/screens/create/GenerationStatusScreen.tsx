/**
 * GenerationStatusScreen — step 3 of 3: follow the AI generation job.
 * Polls the job until it finishes, shows page-level progress and lets the
 * owner cancel, retry, start (if never started) or listen to finished pages.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { TagBadge } from '../../components/TagBadge';
import { StateView } from '../../components/StateView';
import { BookCover } from '../../components/BookCover';
import { audiobooksApi } from '../../api/audiobooks';
import { generationApi } from '../../api/generation';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { SharedStackParamList } from '../../navigation/types';
import { GENERATION_POLL_INTERVAL_MS } from '../../config';
import { Audiobook } from '../../types/audiobook';
import { AudiobookGenerationStatusResponse } from '../../types/generation';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

interface Snapshot {
  book: Audiobook;
  status: AudiobookGenerationStatusResponse;
}

export function GenerationStatusScreen() {
  const { navigation } = useAppNavigation();
  const { audiobookId } = useRoute<RouteProp<SharedStackParamList, 'GenerationStatus'>>().params;
  const { loadAudiobook } = usePlayer();
  const { tx } = useLanguage();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);

  const poll = useCallback(async () => {
    try {
      const [book, status] = await Promise.all([audiobooksApi.get(audiobookId), generationApi.status(audiobookId)]);
      setSnapshot({ book, status });
      setError(null);
      return status.latest_job?.status ?? status.audiobook_status;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    }
  }, [audiobookId]);

  const schedule = useCallback(async () => {
    if (!active.current) return;
    const state = await poll();
    if (!active.current) return;
    // Keep polling only while work is pending; stop on terminal states.
    if (state === 'PENDING' || state === 'PROCESSING' || state === undefined) {
      timer.current = setTimeout(schedule, GENERATION_POLL_INTERVAL_MS);
    }
  }, [poll]);

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      schedule();
      return () => {
        active.current = false;
        if (timer.current) clearTimeout(timer.current);
      };
    }, [schedule]),
  );

  const restartPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    schedule();
  };

  const act = async (name: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(name);
    try {
      await action();
      if (success) Alert.alert(success);
      restartPolling();
    } catch (e) {
      Alert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!snapshot) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader title={tx('অডিও তৈরি', 'Generation')} onBack={() => navigation.goBack()} />
        {error ? (
          <StateView kind="error" message={error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={restartPolling} />
        ) : (
          <StateView kind="loading" />
        )}
      </SafeAreaView>
    );
  }

  const { book, status } = snapshot;
  const job = status.latest_job;
  const state = job ? (job.cancelled ? 'CANCELLED' : job.status) : book.source_file_url ? 'NOT_STARTED' : 'NO_SOURCE';
  const total = job?.total_pages ?? 0;
  const done = job?.completed_pages ?? 0;
  const percent = state === 'COMPLETED' ? 100 : total ? Math.round((done / total) * 100) : 0;

  const label: Record<string, { text: string; variant: 'free' | 'premium' | 'offline' | 'genre' }> = {
    PENDING: { text: tx('কিউতে অপেক্ষমাণ', 'Queued'), variant: 'genre' },
    PROCESSING: { text: tx('তৈরি হচ্ছে', 'Generating'), variant: 'premium' },
    COMPLETED: { text: tx('সম্পন্ন', 'Completed'), variant: 'free' },
    FAILED: { text: tx('ব্যর্থ', 'Failed'), variant: 'offline' },
    CANCELLED: { text: tx('বাতিল', 'Cancelled'), variant: 'offline' },
    NOT_STARTED: { text: tx('শুরু হয়নি', 'Not started'), variant: 'genre' },
    NO_SOURCE: { text: tx('ফাইল নেই', 'No file'), variant: 'genre' },
  };

  const steps = [
    { label: tx('PDF আপলোড', 'PDF uploaded'), done: !!book.source_file_url },
    { label: tx('কিউতে যুক্ত', 'Queued'), done: !!job },
    {
      label: total
        ? tx(`লেখা পড়া ও বর্ণনা · ${done}/${total} পৃষ্ঠা`, `Reading & narrating · ${done}/${total} pages`)
        : tx('লেখা পড়া ও বর্ণনা', 'Reading & narrating'),
      done: state === 'COMPLETED',
      active: state === 'PROCESSING',
    },
    { label: tx('শোনার জন্য প্রস্তুত', 'Ready to listen'), done: state === 'COMPLETED' },
  ];

  const listen = async () => {
    setBusy('listen');
    try {
      await loadAudiobook(book, { chapterIndex: 0, resume: state === 'COMPLETED' });
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (e) {
      Alert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('অডিও তৈরি', 'Generation')}
        subtitle={tx('ধাপ ৩/৩ · অগ্রগতি', 'Step 3 of 3 · Progress')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await poll();
              setRefreshing(false);
            }}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.hero}>
          <BookCover title={book.title} uri={book.cover_image_url} size={72} />
          <View style={styles.heroText}>
            <Text style={styles.bookTitle} numberOfLines={2}>
              {book.title}
            </Text>
            <TagBadge label={label[state].text} variant={label[state].variant} />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{tx('অগ্রগতি', 'Progress')}</Text>
            <Text style={styles.progressValue}>{percent}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }, state === 'FAILED' && styles.fillFailed]} />
          </View>
          {steps.map((step) => (
            <View key={step.label} style={styles.stepRow}>
              <Text style={[styles.stepMark, step.done && styles.stepDone, step.active && styles.stepActive]}>
                {step.done ? '●' : step.active ? '◐' : '○'}
              </Text>
              <Text style={[styles.stepText, !step.done && !step.active && styles.stepPending]}>{step.label}</Text>
            </View>
          ))}
          {state === 'PENDING' ? (
            <Text style={styles.note}>
              {tx(
                'ন্যায্য কিউ অনুযায়ী আপনার পালা এলে শুরু হবে। এই পাতা ছেড়ে গেলেও কাজ চলবে।',
                'It starts when your turn comes in the fair queue. You can leave this screen.',
              )}
            </Text>
          ) : null}
          {job?.error_message && state !== 'COMPLETED' ? <Text style={styles.errorText}>{job.error_message}</Text> : null}
        </View>

        {state === 'COMPLETED' ? (
          <>
            <AppButton label={tx('শুনুন', 'Listen now')}
            icon="play" onPress={listen} isLoading={busy === 'listen'} />
          </>
        ) : null}

        {state === 'PROCESSING' && done > 0 ? (
          <AppButton
            label={tx(`তৈরি হওয়া ${done} পৃষ্ঠা শুনুন`, `Listen to ${done} ready pages`)}
            variant="secondary"
            onPress={listen}
            isLoading={busy === 'listen'}
          />
        ) : null}

        {state === 'NOT_STARTED' || state === 'CANCELLED' ? (
          <AppButton
            label={tx('অডিও তৈরি শুরু করুন', 'Start generating')}
            onPress={() => act('start', () => generationApi.start(audiobookId))}
            isLoading={busy === 'start'}
          />
        ) : null}

        {state === 'FAILED' && job ? (
          <AppButton
            label={tx('আবার চেষ্টা করুন', 'Retry')}
            onPress={() => act('retry', () => generationApi.retry(job.id))}
            isLoading={busy === 'retry'}
          />
        ) : null}

        {(state === 'PENDING' || state === 'PROCESSING') && job ? (
          <AppButton
            label={tx('বাতিল করুন', 'Cancel')}
            variant="secondary"
            isLoading={busy === 'cancel'}
            onPress={() =>
              Alert.alert(tx('বাতিল করবেন?', 'Cancel generation?'), tx('ইতিমধ্যে তৈরি পৃষ্ঠা থেকে যাবে।', 'Pages already generated are kept.'), [
                { text: tx('না', 'No'), style: 'cancel' },
                { text: tx('হ্যাঁ, বাতিল', 'Yes, cancel'), style: 'destructive', onPress: () => act('cancel', () => generationApi.cancel(job.id)) },
              ])
            }
          />
        ) : null}

        {state === 'NO_SOURCE' ? (
          <StateView
            kind="empty"
            compact
            title={tx('এখনো কোনো PDF নেই', 'No PDF uploaded yet')}
            actionLabel={tx('আপলোড করুন', 'Upload')}
            onAction={() => (navigation.getParent() as any)?.navigate('CreateTab', { screen: 'UploadSource', params: { audiobookId, title: book.title } })}
          />
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
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  hero: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
    gap: Spacing.xs,
  },
  bookTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  progressValue: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.track,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.brand,
  },
  fillFailed: {
    backgroundColor: Colors.error,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepMark: {
    width: 16,
    color: Colors.textMuted,
    fontSize: 13,
  },
  stepDone: {
    color: Colors.success,
  },
  stepActive: {
    color: Colors.primary,
  },
  stepText: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  stepPending: {
    color: Colors.textMuted,
  },
  note: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: Colors.tintErrorText,
  },
});
