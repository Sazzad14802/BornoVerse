/**
 * AppHeader — Standardized app header matching Figma design.
 * Features back button, title, contextual subtitle, and 3-dot options menu.
 */

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** 'down' shows a minimize chevron (e.g. the full-screen player) instead of a back arrow. */
  backIcon?: 'back' | 'down';
  onOptionsPress?: () => void;
  alignCenter?: boolean;
  showLogo?: boolean;
  rightActionText?: string;
  onRightAction?: () => void;
  /** Icon button (an Ionicons name) shown on the right; takes precedence over the options menu. */
  rightIcon?: React.ComponentProps<typeof Ionicons>['name'];
  rightIconLabel?: string;
  onRightIconPress?: () => void;
  badgeCount?: number;
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  backIcon = 'back',
  onOptionsPress,
  alignCenter = false,
  showLogo = false,
  rightActionText,
  onRightAction,
  rightIcon,
  rightIconLabel,
  onRightIconPress,
  badgeCount = 0,
}: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={[styles.leftContainer, alignCenter && styles.sideCentered]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            hitSlop={12}
            accessibilityLabel={backIcon === 'down' ? 'Minimize' : 'Go back'}
            accessibilityRole="button"
          >
            {backIcon === 'down' ? (
              <Ionicons name="chevron-down" size={26} color={Colors.textPrimary} />
            ) : (
              <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
            )}
          </Pressable>
        ) : showLogo ? (
          <Image
            source={require('../../assets/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        ) : null}

        {!alignCenter && (
          <View style={styles.titleColumn}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {alignCenter && (
        <View style={styles.centerContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}

      <View style={[styles.rightContainer, alignCenter && styles.sideCentered]}>
        {rightIcon && onRightIconPress ? (
          <Pressable
            onPress={onRightIconPress}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            hitSlop={12}
            accessibilityLabel={rightIconLabel ?? rightIcon}
            accessibilityRole="button"
          >
            <Ionicons name={rightIcon} size={22} color={Colors.textPrimary} />
            {badgeCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : rightActionText && onRightAction ? (
          <Pressable
            onPress={onRightAction}
            style={({ pressed }) => [styles.headerTextBtn, pressed && styles.iconButtonPressed]}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.headerTextBtnLabel}>{rightActionText}</Text>
          </Pressable>
        ) : onOptionsPress ? (
          <Pressable
            onPress={onOptionsPress}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            hitSlop={12}
            accessibilityLabel="Options"
            accessibilityRole="button"
          >
            <Text style={styles.dotsIcon}>⋮</Text>
          </Pressable>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    backgroundColor: 'transparent',
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 2,
  },
  rightContainer: {
    alignItems: 'flex-end',
    minWidth: 32,
  },
  // With a centred title both sides take equal width, so the title is truly centred.
  sideCentered: {
    flex: 1,
  },
  titleColumn: {
    marginLeft: Spacing.xs,
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    opacity: 0.6,
    backgroundColor: Colors.overlayLight,
  },
  dotsIcon: {
    fontSize: 22,
    color: Colors.textPrimary,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm + 2,
    marginRight: Spacing.xs,
  },
  headerTextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.overlayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBtnLabel: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
});
