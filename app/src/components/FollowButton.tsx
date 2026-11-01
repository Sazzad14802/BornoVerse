/**
 * FollowButton — YouTube-style subscribe control for a channel.
 * Not following: a filled "Follow" button. Following: an outlined "Following"
 * button (tap to unfollow, with confirmation) plus a bell that turns new-upload
 * notifications on or off.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChannelProfile, socialApi } from '../api/social';
import { errorMessage } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface FollowButtonProps {
  channel: Pick<ChannelProfile, 'id' | 'name' | 'following' | 'notify' | 'is_owner'>;
  onChange: (profile: ChannelProfile) => void;
  compact?: boolean;
}

export function FollowButton({ channel, onChange, compact }: FollowButtonProps) {
  const { tx } = useLanguage();
  const [busy, setBusy] = useState(false);

  if (channel.is_owner) return null;

  const run = async (action: () => Promise<ChannelProfile>) => {
    setBusy(true);
    try {
      onChange(await action());
    } catch (error) {
      Alert.alert(tx('সম্ভব হয়নি', 'Not possible'), errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const unfollow = () =>
    Alert.alert(channel.name, tx('আনফলো করবেন?', 'Unfollow this channel?'), [
      { text: tx('বাতিল', 'Cancel'), style: 'cancel' },
      { text: tx('আনফলো', 'Unfollow'), style: 'destructive', onPress: () => run(() => socialApi.unfollow(channel.id)) },
    ]);

  if (!channel.following) {
    return (
      <Pressable
        onPress={() => run(() => socialApi.follow(channel.id, true))}
        disabled={busy}
        style={({ pressed }) => [styles.follow, compact && styles.compact, pressed && styles.followPressed]}
        accessibilityRole="button"
        accessibilityLabel={tx(`${channel.name} ফলো করুন`, `Follow ${channel.name}`)}
      >
        {busy ? (
          <ActivityIndicator size="small" color={Colors.textOnPrimary} />
        ) : (
          <Text style={styles.followText}>{tx('ফলো', 'Follow')}</Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={unfollow}
        disabled={busy}
        style={({ pressed }) => [styles.following, compact && styles.compact, pressed && styles.followingPressed]}
        accessibilityRole="button"
        accessibilityLabel={tx('ফলো করছেন, আনফলো করতে চাপুন', 'Following, tap to unfollow')}
      >
        {busy ? (
          <ActivityIndicator size="small" color={Colors.textPrimary} />
        ) : (
          <Text style={styles.followingText}>{tx('ফলো করছেন', 'Following')}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => run(() => socialApi.follow(channel.id, !channel.notify))}
        disabled={busy}
        hitSlop={6}
        style={({ pressed }) => [styles.bell, compact && styles.bellCompact, channel.notify && styles.bellOn, pressed && styles.followingPressed]}
        accessibilityRole="switch"
        accessibilityState={{ checked: channel.notify }}
        accessibilityLabel={tx('নতুন অডিওবুকের নোটিফিকেশন', 'Notify me about new audiobooks')}
      >
        <Ionicons
          name={channel.notify ? 'notifications' : 'notifications-off-outline'}
          size={compact ? 16 : 18}
          color={channel.notify ? Colors.primary : Colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  follow: {
    minWidth: 96,
    height: 38,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minWidth: 84,
    height: 34,
    paddingHorizontal: Spacing.md,
  },
  followPressed: {
    backgroundColor: Colors.primaryDark,
  },
  followText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textOnPrimary,
  },
  following: {
    minWidth: 96,
    height: 38,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingPressed: {
    opacity: 0.7,
  },
  followingText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  bellOn: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primaryLight,
  },
});
