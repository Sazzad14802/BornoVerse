/**
 * AppButton — the app's one button component.
 *
 * Variants: primary (filled brand green), secondary / outline (white, bordered),
 * google (white, bordered, official "G" mark), compact (smaller primary) and
 * text (borderless link). An optional leading Ionicon; loading shows a spinner.
 */

import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'google' | 'outline' | 'compact' | 'text';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  isLoading = false,
  fullWidth = true,
  icon,
}: AppButtonProps) {
  const filled = variant === 'primary' || variant === 'compact';
  const bordered = variant === 'secondary' || variant === 'outline' || variant === 'google';
  const foreground = filled ? Colors.textOnPrimary : variant === 'text' ? Colors.primary : Colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLoading}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'compact' && styles.compact,
        variant === 'text' && styles.text,
        filled && styles.filled,
        filled && pressed && styles.filledPressed,
        bordered && styles.bordered,
        bordered && pressed && styles.borderedPressed,
        variant === 'text' && pressed && styles.textPressed,
        (disabled || isLoading) && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || isLoading, busy: isLoading }}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <View style={styles.content}>
          {variant === 'google' ? (
            <Image source={require('../../assets/google-g.png')} style={styles.googleMark} />
          ) : icon ? (
            <Ionicons name={icon} size={variant === 'compact' ? 16 : 18} color={foreground} />
          ) : null}
          <Text
            style={[styles.label, variant === 'compact' && styles.compactLabel, { color: foreground }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  fullWidth: {
    width: '100%',
  },
  compact: {
    height: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm + 2,
  },
  text: {
    height: 40,
    paddingHorizontal: Spacing.sm,
  },
  filled: {
    backgroundColor: Colors.primary,
  },
  filledPressed: {
    backgroundColor: Colors.primaryDark,
  },
  bordered: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  borderedPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  textPressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  googleMark: {
    width: 18,
    height: 18,
  },
  label: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  compactLabel: {
    fontSize: FontSizes.sm,
  },
});
