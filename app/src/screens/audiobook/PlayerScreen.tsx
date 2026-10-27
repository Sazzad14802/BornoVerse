/**
 * PlayerScreen — opening any audiobook lands here (there is no separate details page).
 *
 * With an `audiobookId` param it loads and starts that book unless it is already
 * playing; premium books the listener can't play show an unlock prompt instead.
 * Without a param (mini player) it shows whatever the PlayerContext has loaded.
 *
 * Artwork, access/genre tags, tap-to-seek progress, ±10s, previous/next chapter,
 * tap-to-cycle speed, then an icon row: Chapters (bottom sheet) · Save · Playlist · Offline · Report.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { BookCover } from '../../components/BookCover';
import { ModalBottomSheet, SheetScrollView } from '../../components/ModalBottomSheet';
import { StateView } from '../../components/StateView';
import { TagBadge } from '../../components/TagBadge';
import { audiobooksApi } from '../../api/audiobooks';
import { libraryApi, playlistsApi } from '../../api/library';
import { reportsApi } from '../../api/account';
import { errorMessage } from '../../api/client';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { SharedStackParamList } from '../../navigation/types';
import { genreLabel } from '../../constants/genres';
import { offline } from '../../storage/offline';
import { isPremium } from '../../types/auth';
import { Playlist } from '../../types/domain';
import { formatClock, formatDuration } from '../../utils/format';
import { SEEK_STEP_SECONDS } from '../../config';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const REPORT_REASONS = [
  { bn: 'কপিরাইট লঙ্ঘন', en: 'Copyright infringement' },
  { bn: 'অনুপযুক্ত কনটেন্ট', en: 'Inappropriate content' },
  { bn: 'অডিওর মান খারাপ', en: 'Poor audio quality' },
  { bn: 'ভুল তথ্য', en: 'Incorrect information' },
];

/** The speed after `current`, wrapping around; unknown speeds restart at 1x. */
function nextSpeed(current: number): number {
  const index = SPEEDS.indexOf(current);
  return index === -1 ? 1 : SPEEDS[(index + 1) % SPEEDS.length];
}

type Sheet = 'chapters' | 'playlist' | 'report' | null;

interface PlayerAction {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
}

export function PlayerScreen() {
  const { navigation, goToTab } = useAppNavigation();
  const requestedId = useRoute<RouteProp<SharedStackParamList, 'Player'>>().params?.audiobookId;
  const { t, tx, isEnglish } = useLanguage();
  const { user } = useAuth();
  const player = usePlayer();
  const {
    audiobook,
    chapters,
    currentChapterIndex,
    isPlaying,
    isLoading,
    isOffline,
    positionSeconds,
    durationSeconds,
    playbackRate,
    error,
  } = player;

  const isMember = user?.account_type === 'user';
  const bookId = requestedId ?? audiobook?.id;

  // Server copy of the book (tags, access) plus this listener's saved/downloaded state.
  const info = useResource(async () => {
    if (!bookId) return null;
    const [book, saved, downloads] = await Promise.all([
      audiobooksApi.get(bookId),
      isMember ? libraryApi.isSaved(bookId).catch(() => false) : Promise.resolve(false),
      user ? offline.list(user.id).catch(() => []) : Promise.resolve([]),
    ]);
    return { book, saved, downloaded: downloads.some((b) => b.id === bookId) };
  }, [bookId]);

  const [trackWidth, setTrackWidth] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylist, setNewPlaylist] = useState('');
  const [reportReason, setReportReason] = useState(0);
  const [reportDetails, setReportDetails] = useState('');
  const startedFor = useRef<string | null>(null);

  // Offline playback may have no server copy; fall back to the loaded book.
  const book = info.data?.book ?? (audiobook?.id === bookId ? audiobook : null);
  const isCurrent = !!audiobook && audiobook.id === bookId;
  const isOwner = !!book && book.owner_id === user?.id;
  const isFree = book?.access_tier !== 'premium';
  const isLocked = !!book && !isFree && !isOwner && !isPremium(user);

  // Opening a book starts it, unless it is already the one loaded or it is locked.
  useEffect(() => {
    const target = info.data?.book;
    if (!requestedId || !target || target.id !== requestedId) return;
    if (audiobook?.id === requestedId || startedFor.current === requestedId) return;
    if (isLocked || target.status !== 'COMPLETED') return;
    startedFor.current = requestedId;
    setOpenError(null);
    player.loadAudiobook(target).catch((e) => setOpenError(errorMessage(e)));
  }, [requestedId, info.data?.book?.id, isLocked]);

  if (!bookId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader title={t('playerNowPlaying')} onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          title={tx('কিছুই বাজছে না', 'Nothing is playing')}
          message={tx('একটি অডিওবুক বেছে নিয়ে শুনতে শুরু করুন।', 'Pick an audiobook to start listening.')}
          actionLabel={tx('ফিরে যান', 'Go back')}
          onAction={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  if (!book) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <AppHeader title={t('playerNowPlaying')} onBack={() => navigation.goBack()} />
        {info.error ? (
          <StateView
            kind="error"
            title={tx('অডিওবুকটি পাওয়া যায়নি', 'Audiobook not available')}
            message={info.error}
            actionLabel={tx('আবার চেষ্টা', 'Retry')}
            onAction={info.reload}
          />
        ) : (
          <StateView kind="loading" />
        )}
      </SafeAreaView>
    );
  }

  const saved = info.data?.saved ?? false;
  const downloaded = info.data?.downloaded ?? false;
  const chapter = isCurrent ? chapters[currentChapterIndex] : undefined;
  const position = isCurrent ? positionSeconds : 0;
  const duration = isCurrent ? durationSeconds : book.duration_seconds;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const shownError = openError ?? (isCurrent ? error : null);

  const update = (patch: { saved?: boolean; downloaded?: boolean }) =>
    info.setData((current) => (current ? { ...current, ...patch } : null));

  const premiumPrompt = (message: string) =>
    Alert.alert(tx('প্রিমিয়াম প্রয়োজন', 'Premium required'), message, [
      { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
      { text: tx('প্রিমিয়াম নিন', 'Get Premium'), onPress: () => goToTab('ProfileTab', { screen: 'Subscription' }) },
    ]);

  const run = async (key: string, action: () => Promise<void>, title = tx('ত্রুটি', 'Error')) => {
    setBusy(key);
    try {
      await action();
    } catch (e) {
      Alert.alert(title, errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const seekFromTouch = (x: number) => {
    if (isCurrent && trackWidth > 0 && duration > 0) player.seek((x / trackWidth) * duration);
  };

  const playChapter = (index: number) =>
    run('chapter', async () => {
      await player.selectChapter(index);
      setSheet(null);
    }, tx('চালানো যায়নি', 'Could not play'));

  const toggleSave = () =>
    run('save', async () => {
      if (saved) await libraryApi.remove(book.id);
      else await libraryApi.add(book.id);
      update({ saved: !saved });
    }, tx('লাইব্রেরি', 'Library'));

  const openPlaylists = () => {
    setSheet('playlist');
    playlistsApi
      .list()
      .then(setPlaylists)
      .catch((e) => Alert.alert(tx('প্লেলিস্ট', 'Playlists'), errorMessage(e)));
  };

  const addToPlaylist = (playlist: Playlist) =>
    run('playlist', async () => {
      await playlistsApi.addBook(playlist.id, book.id);
      setSheet(null);
      Alert.alert(tx('যোগ হয়েছে', 'Added'), tx(`«${playlist.name}»-এ যোগ করা হয়েছে।`, `Added to “${playlist.name}”.`));
    }, tx('প্লেলিস্ট', 'Playlist'));

  const createPlaylist = () =>
    run('playlist', async () => {
      const name = newPlaylist.trim();
      if (!name) return;
      const created = await playlistsApi.create(name);
      setNewPlaylist('');
      await playlistsApi.addBook(created.id, book.id);
      setSheet(null);
      Alert.alert(tx('যোগ হয়েছে', 'Added'), tx(`«${created.name}»-এ যোগ করা হয়েছে।`, `Added to “${created.name}”.`));
    }, tx('প্লেলিস্ট', 'Playlist'));

  const toggleOffline = async () => {
    if (!user) return;
    if (downloaded) {
      await offline.remove(book.id, user.id);
      update({ downloaded: false });
      return;
    }
    if (!isPremium(user)) {
      premiumPrompt(tx('ডাউনলোড করে অফলাইনে শুনতে প্রিমিয়াম প্রয়োজন।', 'Downloading for offline listening needs Premium.'));
      return;
    }
    await run('offline', async () => {
      await offline.download(book, user.id);
      update({ downloaded: true });
      Alert.alert(tx('ডাউনলোড সম্পন্ন', 'Downloaded'), tx('লাইব্রেরি থেকে অফলাইনে শুনতে পারবেন।', 'Play it offline from your Library.'));
    }, tx('ডাউনলোড ব্যর্থ', 'Download failed'));
  };

  const submitReport = () =>
    run('report', async () => {
      const reason = REPORT_REASONS[reportReason];
      await reportsApi.submit(book.id, `${reason.en}${reportDetails.trim() ? `: ${reportDetails.trim()}` : ''}`);
      setSheet(null);
      setReportDetails('');
      Alert.alert(tx('রিপোর্ট জমা হয়েছে', 'Report submitted'), tx('আমাদের টিম এটি পর্যালোচনা করবে।', 'Our team will review it.'));
    }, tx('রিপোর্ট', 'Report'));

  const actions: PlayerAction[] = [];
  if (isCurrent && chapters.length) {
    actions.push({ id: 'chapters', icon: 'list', label: tx('অধ্যায়', 'Chapters'), onPress: () => setSheet('chapters') });
  }
  if (isMember) {
    actions.push({
      id: 'save',
      icon: saved ? 'bookmark' : 'bookmark-outline',
      label: saved ? tx('সংরক্ষিত', 'Saved') : tx('সেভ', 'Save'),
      active: saved,
      onPress: toggleSave,
    });
    actions.push({ id: 'playlist', icon: 'albums-outline', label: tx('প্লেলিস্ট', 'Playlist'), onPress: openPlaylists });
    if (!isOffline && book.status === 'COMPLETED' && !isLocked) {
      actions.push({
        id: 'offline',
        icon: downloaded ? 'checkmark-circle' : 'arrow-down-circle-outline',
        // The label stays "Offline"; the green check icon shows it is downloaded.
        label: tx('অফলাইন', 'Offline'),
        active: downloaded,
        onPress: toggleOffline,
      });
    }
    if (!isOwner) actions.push({ id: 'report', icon: 'flag-outline', label: tx('রিপোর্ট', 'Report'), onPress: () => setSheet('report') });
  }

  const remaining = chapters.slice(currentChapterIndex + 1).reduce((sum, c) => sum + (c.duration_seconds || 0), 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <AppHeader
        title={t('playerNowPlaying')}
        subtitle={isOffline && isCurrent ? tx('অফলাইন', 'Offline') : book.author ?? undefined}
        alignCenter
        backIcon="down"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.artworkContainer}>
          <BookCover title={book.title} uri={book.cover_image_url} fill radius={Radius.xl} />
        </View>

        <Text style={styles.bookTitle}>{book.title}</Text>
        <Text style={styles.chapterSubtitle} numberOfLines={1}>
          {chapter
            ? `${tx('অধ্যায়', 'Chapter')} ${chapter.chapter_number}/${chapters.length} · ${chapter.title}`
            : isLocked
              ? tx('প্রিমিয়াম অডিওবুক', 'Premium audiobook')
              : tx('লোড হচ্ছে…', 'Loading…')}
        </Text>

        <View style={styles.badgeRow}>
          <TagBadge
            label={isFree ? tx('ফ্রি', 'FREE') : isLocked ? tx('প্রিমিয়াম · লকড', 'PREMIUM · LOCKED') : tx('প্রিমিয়াম', 'PREMIUM')}
            variant={isFree ? 'free' : 'premium'}
          />
          {book.genre ? <TagBadge label={genreLabel(book.genre, isEnglish)} variant="genre" /> : null}
        </View>

        {shownError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{shownError}</Text>
          </View>
        ) : null}

        {isLocked ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedText}>
              {tx('এটি শুনতে প্রিমিয়াম সাবস্ক্রিপশন প্রয়োজন।', 'A Premium subscription is required to listen.')}
            </Text>
            <AppButton
              label={tx('প্রিমিয়াম নিয়ে শুনুন', 'Unlock with Premium')}
              onPress={() => goToTab('ProfileTab', { screen: 'Subscription' })}
            />
          </View>
        ) : (
          <>
            <Pressable
              style={styles.progressBarWrapper}
              onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => seekFromTouch(e.nativeEvent.locationX)}
              accessibilityRole="adjustable"
              accessibilityLabel={tx('অগ্রগতি', 'Progress')}
            >
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <View style={[styles.progressThumb, { left: Math.max(0, progress * trackWidth - 7) }]} />
            </Pressable>
            <View style={styles.timeRow}>
              <Text style={styles.timeCounter}>{formatClock(position)}</Text>
              <Text style={styles.timeCounter}>-{formatClock(Math.max(0, duration - position))}</Text>
            </View>

            <View style={styles.controlsRow}>
              <Pressable
                style={({ pressed }) => [styles.toolButton, !isCurrent && styles.disabled, pressed && styles.pressed]}
                disabled={!isCurrent}
                hitSlop={8}
                onPress={() => run('prev', player.prevChapter)}
                accessibilityRole="button"
                accessibilityLabel={tx('আগের অধ্যায়', 'Previous chapter')}
              >
                <Ionicons name="play-skip-back" size={26} color={Colors.textPrimary} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.seekButton, !isCurrent && styles.disabled, pressed && styles.pressed]}
                disabled={!isCurrent}
                hitSlop={8}
                onPress={() => run('back', () => player.skip(-SEEK_STEP_SECONDS))}
                accessibilityRole="button"
                accessibilityLabel={tx(`${SEEK_STEP_SECONDS} সেকেন্ড পিছনে`, `Back ${SEEK_STEP_SECONDS} seconds`)}
              >
                <MaterialIcons name="replay-10" size={34} color={Colors.textPrimary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.mainPlayButton, pressed && styles.mainPlayPressed]}
                onPress={player.togglePlay}
                disabled={!chapter}
                accessibilityRole="button"
                accessibilityLabel={isPlaying && isCurrent ? tx('বিরতি', 'Pause') : tx('চালু করুন', 'Play')}
              >
                {!chapter || (isLoading && !isPlaying) ? (
                  <ActivityIndicator color={Colors.textOnPrimary} />
                ) : (
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={32}
                    color={Colors.textOnPrimary}
                    // The play triangle looks off-centre without a small optical nudge.
                    style={isPlaying ? undefined : styles.playGlyph}
                  />
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.seekButton, !isCurrent && styles.disabled, pressed && styles.pressed]}
                disabled={!isCurrent}
                hitSlop={8}
                onPress={() => run('forward', () => player.skip(SEEK_STEP_SECONDS))}
                accessibilityRole="button"
                accessibilityLabel={tx(`${SEEK_STEP_SECONDS} সেকেন্ড সামনে`, `Forward ${SEEK_STEP_SECONDS} seconds`)}
              >
                <MaterialIcons name="forward-10" size={34} color={Colors.textPrimary} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.toolButton,
                  (!isCurrent || currentChapterIndex + 1 >= chapters.length) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                disabled={!isCurrent || currentChapterIndex + 1 >= chapters.length}
                hitSlop={8}
                onPress={() => run('next', player.nextChapter)}
                accessibilityRole="button"
                accessibilityLabel={tx('পরের অধ্যায়', 'Next chapter')}
              >
                <Ionicons name="play-skip-forward" size={26} color={Colors.textPrimary} />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.speedButton, pressed && styles.pressed]}
              onPress={() => player.setSpeed(nextSpeed(playbackRate))}
              accessibilityRole="button"
              accessibilityLabel={tx(`গতি ${playbackRate}x, বদলাতে চাপুন`, `Speed ${playbackRate}x, tap to change`)}
            >
              <Ionicons name="speedometer-outline" size={16} color={Colors.textPrimary} />
              <Text style={styles.speedText}>{playbackRate}x</Text>
            </Pressable>
          </>
        )}

        {actions.length ? (
          <View style={styles.actionRow}>
            {actions.map((action) => {
              const color = action.active ? Colors.primary : Colors.textPrimary;
              return (
                <Pressable
                  key={action.id}
                  onPress={action.onPress}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={{ selected: !!action.active }}
                >
                  <Ionicons name={action.icon} size={24} color={color} />
                  <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <ModalBottomSheet visible={sheet === 'chapters'} onClose={() => setSheet(null)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{tx(`অধ্যায় (${chapters.length})`, `Chapters (${chapters.length})`)}</Text>
          <Text style={styles.sheetHint}>
            {tx(`এরপর বাকি ${formatDuration(remaining)}`, `${formatDuration(remaining)} left after this chapter`)}
          </Text>
          <SheetScrollView maxHeight={420}>
            {chapters.map((c, index) => {
              const current = index === currentChapterIndex;
              const played = index < currentChapterIndex;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => playChapter(index)}
                  disabled={busy === 'chapter'}
                  style={({ pressed }) => [styles.chapterRow, current && styles.chapterRowCurrent, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                >
                  <View style={styles.chapterNumberCell}>
                    {current ? (
                      <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={16} color={Colors.primary} />
                    ) : (
                      <Text style={styles.chapterNumber}>{c.chapter_number}</Text>
                    )}
                  </View>
                  <Text style={[styles.chapterTitle, played && styles.chapterTitlePlayed]} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.chapterDuration}>{formatDuration(c.duration_seconds)}</Text>
                </Pressable>
              );
            })}
          </SheetScrollView>
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={sheet === 'playlist'} onClose={() => setSheet(null)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{tx('প্লেলিস্টে যোগ করুন', 'Add to playlist')}</Text>
          <View style={styles.inlineRow}>
            <TextInput
              style={styles.textInput}
              value={newPlaylist}
              onChangeText={setNewPlaylist}
              placeholder={tx('নতুন প্লেলিস্টের নাম', 'New playlist name')}
              placeholderTextColor={Colors.textMuted}
              maxLength={150}
            />
            <AppButton
              label={tx('তৈরি', 'Create')}
              onPress={createPlaylist}
              variant="compact"
              fullWidth={false}
              disabled={!newPlaylist.trim() || busy === 'playlist'}
            />
          </View>
          {playlists.map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              onPress={() => addToPlaylist(p)}
              disabled={busy === 'playlist'}
            >
              <Text style={styles.optionText}>{p.name}</Text>
            </Pressable>
          ))}
          {playlists.length === 0 ? (
            <Text style={styles.emptyNotice}>{tx('এখনো কোনো প্লেলিস্ট নেই।', 'No playlists yet.')}</Text>
          ) : null}
        </View>
      </ModalBottomSheet>

      <ModalBottomSheet visible={sheet === 'report'} onClose={() => setSheet(null)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{tx('অডিওবুক রিপোর্ট করুন', 'Report audiobook')}</Text>
          {REPORT_REASONS.map((reason, index) => (
            <Pressable
              key={reason.en}
              style={[styles.option, reportReason === index && styles.optionActive]}
              onPress={() => setReportReason(index)}
            >
              <Text style={[styles.optionText, reportReason === index && styles.optionTextActive]}>
                {isEnglish ? reason.en : reason.bn}
              </Text>
            </Pressable>
          ))}
          <TextInput
            style={[styles.textInput, styles.multiline]}
            value={reportDetails}
            onChangeText={setReportDetails}
            placeholder={tx('বিস্তারিত (ঐচ্ছিক)', 'Details (optional)')}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={1000}
          />
          <AppButton label={tx('রিপোর্ট জমা দিন', 'Submit report')} onPress={submitReport} isLoading={busy === 'report'} />
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
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    alignItems: 'center',
  },
  artworkContainer: {
    width: '86%',
    aspectRatio: 1,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    marginVertical: Spacing.sm,
  },
  bookTitle: {
    fontSize: FontSizes.xl + 2,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  chapterSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: Colors.tintError,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  errorText: {
    color: Colors.tintErrorText,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  lockedCard: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  lockedText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  progressBarWrapper: {
    width: '100%',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.track,
    borderRadius: Radius.full,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.brand,
  },
  progressThumb: {
    position: 'absolute',
    // Track is 4pt tall inside Spacing.md padding; centre the 14pt thumb on it.
    top: Spacing.md - 5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.brand,
  },
  timeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeCounter: {
    fontSize: FontSizes.xs + 1,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  controlsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.md,
  },
  toolButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  seekButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    marginLeft: 3,
  },
  mainPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  mainPlayPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  speedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  speedText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  pressed: {
    opacity: 0.6,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalContent: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sheetHint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  chapterRowCurrent: {
    backgroundColor: Colors.primarySurface,
  },
  chapterNumberCell: {
    width: 24,
    alignItems: 'center',
  },
  chapterNumber: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  chapterTitle: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  chapterTitlePlayed: {
    color: Colors.textSecondary,
  },
  chapterDuration: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    minHeight: 46,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  multiline: {
    minHeight: 80,
    paddingTop: Spacing.sm,
    textAlignVertical: 'top',
    flex: 0,
  },
  option: {
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  optionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  optionText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  optionTextActive: {
    color: Colors.primary,
  },
  emptyNotice: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
});
