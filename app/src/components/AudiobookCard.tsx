/**
 * AudiobookCard — Row item matching Figma Plate 3 (Home, Explore, Search).
 * Artwork · Title · Author · Free/Premium status · Circular Peach Play Button.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audiobook } from '../types/audiobook';
import { BookCover } from './BookCover';
import { formatDuration } from '../utils/format';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface AudiobookCardProps {
  audiobook: Audiobook;
  onPress: () => void;
  onPlayPress?: () => void;
  /** Overall listening progress (0–100) when known. */
  progressPercent?: number;
  /** Replaces the default access/duration meta line (e.g. generation status). */
  meta?: string;
  /** Custom control on the right (e.g. a Remove button); replaces the play button / chevron. */
  trailing?: React.ReactNode;
}

export function AudiobookCard({ audiobook, onPress, onPlayPress, progressPercent, meta, trailing }: AudiobookCardProps) {
  const isPremium = audiobook.access_tier === 'premium';
  const duration = audiobook.duration_seconds ? ` · ${formatDuration(audiobook.duration_seconds)}` : '';
  const progressText = progressPercent ? ` · ${Math.round(progressPercent)}%` : '';
  const statusLabel = meta ?? `${isPremium ? 'Premium' : 'Free'}${duration}${progressText}`;
  const playable = audiobook.status === 'COMPLETED';

  return (
    <Pressable
      style={({ pressed }) => [styles.rowContainer, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${audiobook.title} by ${audiobook.author ?? 'Unknown'}`}
    >
      {/* Thumbnail */}
      <View style={styles.coverWrapper}>
        <BookCover title={audiobook.title} uri={audiobook.cover_image_url} size={58} />
      </View>

      {/* Book Metadata */}
      <View style={styles.detailsColumn}>
        <Text style={styles.title} numberOfLines={1}>
          {audiobook.title}
        </Text>
        {audiobook.author ? (
          <Text style={styles.author} numberOfLines={1}>
            {audiobook.author}
          </Text>
        ) : null}
        <Text
          style={[
            styles.metaText,
            meta ? styles.neutralMeta : isPremium ? styles.premiumMeta : styles.freeMeta,
          ]}
          numberOfLines={1}
        >
          {statusLabel}
        </Text>
        {progressPercent ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, progressPercent)}%` }]} />
          </View>
        ) : null}
      </View>

      {/* Custom trailing control, else a circular play button for ready audio, else a chevron */}
      {trailing ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : playable && onPlayPress ? (
        <Pressable
          style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          onPress={onPlayPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Play ${audiobook.title}`}
        >
          <Ionicons name="play" size={18} color={Colors.primary} style={styles.playIcon} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} style={styles.chevron} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'transparent',
  },
  rowPressed: {
    opacity: 0.7,
    backgroundColor: Colors.overlayLight,
    borderRadius: Radius.md,
  },
  coverWrapper: {
    marginRight: Spacing.md,
  },
  neutralMeta: {
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.brand,
  },
  trailing: {
    marginLeft: Spacing.sm,
  },
  chevron: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  detailsColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.base + 0.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  author: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  metaText: {
    fontSize: FontSizes.xs,
    marginTop: 3,
    fontWeight: '600',
  },
  freeMeta: {
    color: Colors.tintGreenText,
  },
  premiumMeta: {
    color: Colors.tintPurpleText,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  playButtonPressed: {
    backgroundColor: Colors.brandSoftPressed,
    transform: [{ scale: 0.96 }],
  },
  playIcon: {
    marginLeft: 2, // optical center for play triangle
  },
});
