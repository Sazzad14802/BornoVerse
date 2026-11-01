/**
 * Channel entries that open the channel page:
 * - ChannelRow: avatar, name, followers and the Follow + bell control (lists).
 * - ChannelTile: avatar and name for horizontal shelves.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FollowButton } from './FollowButton';
import { ChannelSummary } from '../api/social';
import { useLanguage } from '../contexts/LanguageContext';
import { Colors, FontSizes, Spacing } from '../theme';

export function channelInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface ChannelEntryProps {
  channel: ChannelSummary;
  onPress: () => void;
}

export function ChannelRow({
  channel,
  onPress,
  onChange,
  last,
}: ChannelEntryProps & { onChange: (next: ChannelSummary) => void; last?: boolean }) {
  const { tx } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={channel.name}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{channelInitials(channel.name)}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={styles.meta}>
          {tx(`${channel.followers} জন ফলোয়ার`, `${channel.followers} ${channel.followers === 1 ? 'follower' : 'followers'}`)}
        </Text>
      </View>
      <FollowButton
        compact
        channel={channel}
        onChange={(profile) =>
          onChange({ ...channel, following: profile.following, notify: profile.notify, followers: profile.followers })
        }
      />
    </Pressable>
  );
}

export function ChannelTile({ channel, onPress }: ChannelEntryProps) {
  const { tx } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={channel.name}
    >
      <View style={[styles.avatar, styles.tileAvatar, channel.following && styles.followingRing]}>
        <Text style={[styles.avatarText, styles.tileAvatarText]}>{channelInitials(channel.name)}</Text>
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {channel.name}
      </Text>
      <Text style={styles.tileMeta}>
        {channel.following ? tx('ফলো করছেন', 'Following') : tx(`${channel.followers} ফলোয়ার`, `${channel.followers} followers`)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textOnPrimary,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  meta: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  tile: {
    width: 88,
    alignItems: 'center',
    gap: 4,
  },
  tileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginBottom: 2,
  },
  tileAvatarText: {
    fontSize: FontSizes.lg,
  },
  followingRing: {
    borderWidth: 3,
    borderColor: Colors.brandLight,
  },
  tileName: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  tileMeta: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
