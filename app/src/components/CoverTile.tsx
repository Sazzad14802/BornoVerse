/**
 * CoverTile — square cover with title and author for horizontal shelves,
 * with a round play button on the artwork.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BookCover } from './BookCover';
import { Audiobook } from '../types/audiobook';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface CoverTileProps {
  audiobook: Audiobook;
  onPress: () => void;
  onPlayPress?: () => void;
  width?: number;
}

export function CoverTile({ audiobook, onPress, onPlayPress, width = 140 }: CoverTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={audiobook.title}
    >
      <View style={[styles.cover, { width, height: width }]}>
        <BookCover title={audiobook.title} uri={audiobook.cover_image_url} fill radius={Radius.md} />
        {audiobook.access_tier === 'premium' ? (
          <View style={styles.premium}>
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        ) : null}
        {onPlayPress ? (
          <Pressable
            onPress={onPlayPress}
            hitSlop={8}
            style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Play ${audiobook.title}`}
          >
            <Ionicons name="play" size={16} color={Colors.textOnPrimary} style={styles.playGlyph} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {audiobook.title}
      </Text>
      {audiobook.channel_name || audiobook.author ? (
        <Text style={styles.author} numberOfLines={1}>
          {audiobook.channel_name ?? audiobook.author}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    gap: 4,
  },
  pressed: {
    opacity: 0.8,
  },
  cover: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    marginBottom: Spacing.xs,
  },
  premium: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(15, 42, 34, 0.75)',
  },
  premiumText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.textOnDark,
  },
  play: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  playPressed: {
    backgroundColor: Colors.primaryDark,
  },
  playGlyph: {
    marginLeft: 2,
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  author: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
});
