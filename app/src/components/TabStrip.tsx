/**
 * TabStrip — equal-width tabs that always fit the screen (no sideways scroll):
 * an icon over a short label, an optional count, and an underline on the
 * selected tab. Labels shrink to fit on narrow phones.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Spacing } from '../theme';

export interface TabStripItem<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  count?: number;
}

interface TabStripProps<T extends string> {
  items: TabStripItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function TabStrip<T extends string>({ items, value, onChange }: TabStripProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.value === value;
        const color = selected ? Colors.primary : Colors.textSecondary;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.count !== undefined ? `${item.label}, ${item.count}` : item.label}
          >
            <View style={styles.iconRow}>
              <Ionicons name={item.icon} size={20} color={color} />
              {item.count ? (
                <Text style={[styles.count, selected && styles.countSelected]}>{item.count > 99 ? '99+' : item.count}</Text>
              ) : null}
            </View>
            <Text
              style={[styles.label, { color }, selected && styles.labelSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {item.label}
            </Text>
            <View style={[styles.underline, selected && styles.underlineSelected]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.xs,
    gap: 3,
  },
  pressed: {
    opacity: 0.7,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  count: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  countSelected: {
    color: Colors.primary,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  labelSelected: {
    fontWeight: '700',
  },
  underline: {
    alignSelf: 'stretch',
    marginHorizontal: Spacing.sm,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  underlineSelected: {
    backgroundColor: Colors.primary,
  },
});
