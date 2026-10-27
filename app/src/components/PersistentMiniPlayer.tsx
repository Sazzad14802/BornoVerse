/**
 * PersistentMiniPlayer — docked above the tab bar while something is loaded.
 * Artwork · title · chapter · play/pause · next chapter, with a hairline progress bar.
 * Swipe it down to stop playback and dismiss it; the bar follows the finger and
 * springs back on a short drag. Buttons only react to taps, never to swipes.
 */

import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, GestureResponderEvent, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useLanguage } from '../contexts/LanguageContext';
import { BookCover } from './BookCover';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface PersistentMiniPlayerProps {
  onPress: (audiobookId: string) => void;
}

/** How far (pt) a finger may move and still count as a tap. */
const TAP_SLOP = 10;
/** Drag distance (pt) or downward fling speed that dismisses the player. */
const DISMISS_DISTANCE = 40;
const DISMISS_VELOCITY = 0.8;
/** Far enough to slide the bar fully behind the tab bar. */
const HIDDEN_OFFSET = 100;

/** Vertical drag-to-dismiss: follows the finger downward, then dismisses or springs back. */
function useSwipeDownToDismiss(onDismiss: () => void) {
  const offset = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const springBack = () => Animated.spring(offset, { toValue: 0, bounciness: 6, useNativeDriver: false }).start();

  const responder = useRef(
    PanResponder.create({
      // Capture phase, so a drag that starts on a button still moves the bar.
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          Animated.timing(offset, { toValue: HIDDEN_OFFSET, duration: 160, useNativeDriver: false }).start(() =>
            dismissRef.current(),
          );
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const style = {
    transform: [{ translateY: offset }],
    opacity: offset.interpolate({ inputRange: [0, HIDDEN_OFFSET], outputRange: [1, 0], extrapolate: 'clamp' }),
  };
  return { offset, responder, style };
}

/**
 * Pressable fires onPress on release even after the finger slid a little, so a
 * swipe that starts on a button would trigger it. Only accept stationary taps.
 */
function useTapOnly() {
  const start = useRef({ x: 0, y: 0 });
  return (action: () => void) => ({
    onPressIn: (e: GestureResponderEvent) => {
      start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    },
    onPress: (e: GestureResponderEvent) => {
      const moved = Math.hypot(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y);
      if (moved <= TAP_SLOP) action();
    },
  });
}

export function PersistentMiniPlayer({ onPress }: PersistentMiniPlayerProps) {
  const {
    audiobook,
    chapters,
    currentChapterIndex,
    isPlaying,
    isLoading,
    error,
    togglePlay,
    nextChapter,
    positionSeconds,
    durationSeconds,
    stop,
  } = usePlayer();
  const { tx } = useLanguage();
  const tap = useTapOnly();
  const swipe = useSwipeDownToDismiss(() => {
    stop().catch(() => {});
  });

  // A newly loaded audiobook shows the bar in place again after a dismissal.
  useEffect(() => {
    swipe.offset.setValue(0);
  }, [audiobook?.id]);

  if (!audiobook) return null;

  const chapter = chapters[currentChapterIndex];
  const subtitle = error
    ? error
    : chapter
      ? `${tx('অধ্যায়', 'Chapter')} ${chapter.chapter_number} · ${chapter.title}`
      : tx('লোড হচ্ছে…', 'Loading…');
  const progress = durationSeconds > 0 ? Math.min(100, (positionSeconds / durationSeconds) * 100) : 0;
  const hasNext = currentChapterIndex + 1 < chapters.length;

  return (
    <Animated.View style={[styles.wrapper, swipe.style]} {...swipe.responder.panHandlers}>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
      </View>

      <Pressable
        style={styles.container}
        {...tap(() => onPress(audiobook.id))}
        accessibilityRole="button"
        accessibilityLabel={`${tx('এখন বাজছে', 'Now playing')} ${audiobook.title}`}
      >
        <View style={styles.thumbnailContainer}>
          <BookCover title={audiobook.title} uri={audiobook.cover_image_url} size={42} radius={Radius.sm} />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {audiobook.title}
          </Text>
          <Text style={[styles.subtitle, error ? styles.subtitleError : null]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.controlsRow}>
          {error ? (
            <Pressable
              {...tap(stop)}
              style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
              hitSlop={8}
              accessibilityLabel={tx('বন্ধ করুন', 'Close player')}
            >
              <Ionicons name="close" size={22} color={Colors.textOnDark} />
            </Pressable>
          ) : (
            <>
              <Pressable
                {...tap(togglePlay)}
                disabled={!chapter}
                style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
                hitSlop={8}
                accessibilityLabel={isPlaying ? tx('বিরতি', 'Pause') : tx('চালু করুন', 'Play')}
              >
                {isLoading && !isPlaying ? (
                  <ActivityIndicator size="small" color={Colors.textOnDark} />
                ) : (
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color={Colors.textOnDark} />
                )}
              </Pressable>
              <Pressable
                {...tap(() => nextChapter().catch(() => {}))}
                disabled={!hasNext}
                style={({ pressed }) => [
                  styles.controlButton,
                  !hasNext && styles.controlDisabled,
                  pressed && styles.controlPressed,
                ]}
                hitSlop={8}
                accessibilityLabel={tx('পরের অধ্যায়', 'Next chapter')}
              >
                <Ionicons name="play-skip-forward" size={20} color={Colors.textOnDark} />
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surfaceDark,
    overflow: 'hidden',
  },
  progressBarTrack: {
    height: 2.5,
    backgroundColor: Colors.onDarkHairline,
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.brandLight,
  },
  container: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceDark,
  },
  thumbnailContainer: {
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: FontSizes.base,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  subtitle: {
    color: Colors.textOnDarkSecondary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  subtitleError: {
    color: Colors.textOnDarkAccent,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPressed: {
    opacity: 0.6,
  },
  controlDisabled: {
    opacity: 0.3,
  },
});
