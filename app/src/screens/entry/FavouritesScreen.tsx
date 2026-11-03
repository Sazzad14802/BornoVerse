/**
 * FavouritesScreen — shown once to a new listener: pick at least five
 * favourite genres and publishers (channels). Recommendations on Home start
 * from these until there is listening history.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../../components/AppButton';
import { ChannelSummary, socialApi } from '../../api/social';
import { errorMessage } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { GENRES } from '../../constants/genres';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const MINIMUM = 5;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function FavouritesScreen({ onDone, editing = false }: { onDone: () => void; editing?: boolean }) {
  const { tx, isEnglish } = useLanguage();
  const [genres, setGenres] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<ChannelSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socialApi.channels().then(setPublishers).catch(() => setPublishers([]));
    // Editing later starts from what was saved.
    if (editing) {
      socialApi
        .favourites()
        .then((f) => {
          setGenres(f.genres);
          setChannels(f.channels);
        })
        .catch(() => {});
    }
  }, [editing]);

  const count = genres.length + channels.length;
  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await socialApi.saveFavourites(genres, channels);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{tx('আপনার পছন্দ বেছে নিন', 'Select your favourites')}</Text>
        <Text style={styles.subtitle}>
          {tx(
            `অন্তত ${MINIMUM}টি ধরন বা প্রকাশক বেছে নিন। এগুলো দেখে আমরা আপনাকে অডিওবুক সাজেস্ট করব।`,
            `Pick at least ${MINIMUM} genres or publishers. We use them to recommend audiobooks for you.`,
          )}
        </Text>

        <Text style={styles.section}>{tx('ধরন', 'Genres')}</Text>
        <View style={styles.grid}>
          {GENRES.map((genre) => {
            const selected = genres.includes(genre.key);
            return (
              <Pressable
                key={genre.key}
                onPress={() => toggle(genres, setGenres, genre.key)}
                style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
              >
                <Ionicons name={genre.icon as any} size={24} color={selected ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]} numberOfLines={2}>
                  {isEnglish ? genre.en : genre.bn}
                </Text>
                {selected ? (
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={12} color={Colors.textOnPrimary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {publishers.length ? (
          <>
            <Text style={styles.section}>{tx('প্রকাশক', 'Publishers')}</Text>
            <View style={styles.publishers}>
              {publishers.map((channel) => {
                const selected = channels.includes(channel.id);
                return (
                  <Pressable
                    key={channel.id}
                    onPress={() => toggle(channels, setChannels, channel.id)}
                    style={({ pressed }) => [styles.publisher, pressed && styles.pressed]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <View style={[styles.avatar, selected && styles.avatarSelected]}>
                      <Text style={[styles.avatarText, selected && styles.avatarTextSelected]}>{initials(channel.name)}</Text>
                      {selected ? (
                        <View style={styles.avatarCheck}>
                          <Ionicons name="checkmark" size={12} color={Colors.textOnPrimary} />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.publisherName} numberOfLines={2}>
                      {channel.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(1, count / MINIMUM) * 100}%` }]} />
          </View>
          <Text style={styles.counter}>
            {count >= MINIMUM ? tx(`${count}টি বেছে নেওয়া হয়েছে`, `${count} selected`) : tx(`${count}/${MINIMUM}`, `${count} of ${MINIMUM}`)}
          </Text>
        </View>
        <AppButton label={tx('চালিয়ে যান', 'Continue')} onPress={save} isLoading={saving} disabled={count < MINIMUM} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSizes['2xl'],
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  section: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '31.5%',
    minHeight: 92,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: Spacing.sm,
  },
  tileSelected: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.primarySurface,
  },
  pressed: {
    opacity: 0.75,
  },
  tileLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  tileLabelSelected: {
    color: Colors.primaryDark,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.lg,
  },
  publisher: {
    width: '25%',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  avatarText: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  avatarTextSelected: {
    color: Colors.primary,
  },
  avatarCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publisherName: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  counter: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  error: {
    fontSize: FontSizes.sm,
    color: Colors.tintErrorText,
  },
});
