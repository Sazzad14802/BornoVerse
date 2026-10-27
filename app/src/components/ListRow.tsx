/**
 * ListRow — a tappable settings/menu row with optional subtitle and trailing value.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface ListRowProps {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}

export function ListRow({ icon, title, subtitle, value, onPress, destructive, last }: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {icon ? (
        <View style={[styles.iconBox, destructive && styles.iconBoxDestructive]}>
          <Ionicons name={icon} size={18} color={destructive ? Colors.error : Colors.primary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={[styles.title, destructive && styles.destructive]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress && !destructive ? <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  pressed: {
    opacity: 0.6,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySurface,
  },
  iconBoxDestructive: {
    backgroundColor: Colors.tintError,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  destructive: {
    color: Colors.error,
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  value: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
