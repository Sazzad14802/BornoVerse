/**
 * GenerationStatusScreen — step 3 of 3: follow the generation job.
 * Polls the job until it finishes and shows a progress ring with the page
 * count, a live step list and rotating tips. The owner can cancel, retry,
 * start (if never started) or listen to the pages that are already ready.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppAlert } from '../../components/AppAlert';
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { TagBadge } from '../../components/TagBadge';
import { StateView } from '../../components/StateView';
import { BookCover } from '../../components/BookCover';
import { ProgressRing } from '../../components/ProgressRing';
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
      if (success) AppAlert.alert(success);
      restartPolling();
    } catch (e) {
      AppAlert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Rotating tips while the listener waits.
  const [tip, setTip] = useState(0);
  const tipOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(tipOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setTip((t) => t + 1);
        Animated.timing(tipOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [tipOpacity]);

  // A soft pulse on the active step.
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

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
  const working = state === 'PENDING' || state === 'PROCESSING';

  const label: Record<string, { text: string; variant: 'free' | 'premium' | 'offline' | 'genre' }> = {
    PENDING: { text: tx('কিউতে অপেক্ষমাণ', 'Queued'), variant: 'genre' },
    PROCESSING: { text: tx('তৈরি হচ্ছে', 'Generating'), variant: 'premium' },
    COMPLETED: { text: tx('সম্পন্ন', 'Completed'), variant: 'free' },
    FAILED: { text: tx('ব্যর্থ', 'Failed'), variant: 'offline' },
    CANCELLED: { text: tx('বাতিল', 'Cancelled'), variant: 'offline' },
    NOT_STARTED: { text: tx('শুরু হয়নি', 'Not started'), variant: 'genre' },
    NO_SOURCE: { text: tx('ফাইল নেই', 'No file'), variant: 'genre' },
  };

  const tips = [
    tx('এই পাতা ছেড়ে গেলেও কাজ চলতে থাকবে।', 'You can leave this screen; the work keeps going.'),
    tx('প্রথম পৃষ্ঠা তৈরি হলেই শোনা শুরু করতে পারবেন।', 'You can start listening as soon as the first page is ready.'),
    tx('শেষ হলে নোটিফিকেশন পাবেন।', 'You will get a notification when it is done.'),
    tx('প্রতিটি পৃষ্ঠা একটি আলাদা অধ্যায় হয়।', 'Each page becomes its own chapter.'),
  ];

  const steps = [
    { label: tx('PDF আপলোড', 'PDF uploaded'), done: !!book.source_file_url, active: false },
    { label: tx('কিউতে যুক্ত', 'Queued'), done: !!job && state !== 'PENDING', active: state === 'PENDING' },
    {
      label: total
        ? tx(`লেখা পড়া ও বর্ণনা · ${done}/${total} পৃষ্ঠা`, `Reading & narrating · ${done}/${total} pages`)
        : tx('লেখা পড়া ও বর্ণনা', 'Reading & narrating'),
      done: state === 'COMPLETED',
      active: state === 'PROCESSING',
    },
    { label: tx('শোনার জন্য প্রস্তুত', 'Ready to listen'), done: state === 'COMPLETED', active: false },
  ];

  const listen = async () => {
    setBusy('listen');
    try {
      await loadAudiobook(book, { chapterIndex: 0, resume: state === 'COMPLETED' });
      navigation.navigate('Player', { audiobookId: book.id });
    } catch (e) {
      AppAlert.alert(tx('চালানো যায়নি', 'Could not play'), errorMessage(e));
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
          <BookCover title={book.title} uri={book.cover_image_url} size={56} />
          <View style={styles.heroText}>
            <Text style={styles.bookTitle} numberOfLines={2}>
              {book.title}
            </Text>
            <TagBadge label={label[state].text} variant={label[state].variant} />
          </View>
        </View>

        <View style={styles.ringBlock}>
          <ProgressRing
            progress={percent / 100}
            indeterminate={state === 'PENDING' || (state === 'PROCESSING' && !total)}
            color={state === 'FAILED' ? Colors.error : Colors.primary}
            caption={total ? tx(`${done}/${total} পৃষ্ঠা`, `${done} / ${total} pages`) : undefined}
          />
          {working ? (
            <Animated.Text style={[styles.tip, { opacity: tipOpacity }]}>{tips[tip % tips.length]}</Animated.Text>
          ) : null}
        </View>

        <View style={styles.card}>
          {steps.map((step, i) => (
            <View key={step.label} style={styles.stepRow}>
              <View style={styles.stepRail}>
                {step.done ? (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                ) : step.active ? (
                  <Animated.View style={[styles.activeDot, { opacity: pulse }]} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={Colors.textMuted} />
                )}
                {i < steps.length - 1 ? <View style={[styles.railLine, step.done && styles.railLineDone]} /> : null}
              </View>
              <Text style={[styles.stepText, step.active && styles.stepTextActive, !step.done && !step.active && styles.stepPending]}>
                {step.label}
              </Text>
            </View>
          ))}
          {job?.error_message && state !== 'COMPLETED' ? <Text style={styles.errorText}>{job.error_message}</Text> : null}
        </View>

        {state === 'COMPLETED' ? (
          <AppButton label={tx('শুনুন', 'Listen now')} icon="play" onPress={listen} isLoading={busy === 'listen'} />
        ) : null}

        {state === 'PROCESSING' && done > 0 ? (
          <AppButton
            label={tx(`তৈরি হওয়া ${done} পৃষ্ঠা শুনুন`, `Listen to ${done} ready pages`)}
            icon="headset-outline"
            variant="secondary"
            onPress={listen}
            isLoading={busy === 'listen'}
          />
        ) : null}

        {state === 'NOT_STARTED' || state === 'CANCELLED' ? (
          <AppButton
            label={tx('অডিও তৈরি শুরু করুন', 'Start generating')}
            icon="sparkles-outline"
            onPress={() => act('start', () => generationApi.start(audiobookId))}
            isLoading={busy === 'start'}
          />
        ) : null}

        {state === 'FAILED' && job ? (
          <AppButton
            label={tx('আবার চেষ্টা করুন', 'Retry')}
            icon="reload"
            onPress={() => act('retry', () => generationApi.retry(job.id))}
            isLoading={busy === 'retry'}
          />
        ) : null}

        {working && job ? (
          <AppButton
            label={tx('বাতিল করুন', 'Cancel')}
            variant="text"
            isLoading={busy === 'cancel'}
            onPress={() =>
              AppAlert.alert(tx('বাতিল করবেন?', 'Cancel generation?'), tx('ইতিমধ্যে তৈরি পৃষ্ঠা থেকে যাবে।', 'Pages already generated are kept.'), [
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
            onAction={() =>
              (navigation.getParent() as any)?.navigate('CreateTab', {
                screen: 'UploadSource',
                params: { audiobookId, title: book.title },
              })
            }
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
  ringBlock: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tip: {
    minHeight: 40,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepRail: {
    width: 22,
    alignItems: 'center',
  },
  activeDot: {
    width: 18,
    height: 18,
    margin: 2,
    borderRadius: 9,
    backgroundColor: Colors.primary,
  },
  railLine: {
    width: 2,
    height: 18,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 2,
  },
  railLineDone: {
    backgroundColor: Colors.success,
  },
  stepText: {
    flex: 1,
    paddingTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  stepTextActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  stepPending: {
    color: Colors.textMuted,
  },
  errorText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.tintErrorText,
  },
});
