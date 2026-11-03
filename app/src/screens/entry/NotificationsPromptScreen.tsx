/**
 * NotificationsPromptScreen — Notification permissions matching Figma Plate 1 Screen 6.
 * Contextual explanation card and system prompt dialog card.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';
import { useLanguage } from '../../contexts/LanguageContext';

interface NotificationsPromptScreenProps {
  onBack: () => void;
  onAllow: () => void;
  onSkip: () => void;
}

export function NotificationsPromptScreen({
  onBack,
  onAllow,
  onSkip,
}: NotificationsPromptScreenProps) {
  const { isEnglish } = useLanguage();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <AppHeader
        title={isEnglish ? 'Notifications' : 'নোটিফিকেশন'}
        subtitle={isEnglish ? 'Alerts & updates' : 'আপডেট ও নোটিফিকেশন'}
        onBack={onBack}
      />

      <View style={styles.content}>
        {/* Context Explanation Card */}
        <View style={styles.contextCard}>
          <Text style={styles.contextTitle}>
            {isEnglish ? 'Why is this needed?' : 'কেন দরকার?'}
          </Text>
          <Text style={styles.contextSub}>
            {isEnglish
              ? 'For new releases, offline downloads, and audio generation alerts.'
              : 'New releases, downloads এবং generation update-এর জন্য।'}
          </Text>
        </View>

        {/* Dialog Card */}
        <View style={styles.dialogCard}>
          {/* Bell Icon Circle */}
          <View style={styles.iconCircle}>
            <View style={styles.innerDot} />
          </View>

          <Text style={styles.dialogTitle}>
            {isEnglish
              ? 'Allow BornoVerse to send you notifications?'
              : 'BornoVerse-কে notification পাঠাতে দেবেন?'}
          </Text>

          <Text style={styles.dialogDescription}>
            {isEnglish
              ? 'You can always adjust this in your device settings later.'
              : 'আপনি পরে Android settings থেকে বদলাতে পারবেন।'}
          </Text>

          {/* Action Buttons Row */}
          <View style={styles.buttonsRow}>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={styles.outlineButtonText}>
                {isEnglish ? 'Not Now' : 'এখন নয়'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={onAllow}
              accessibilityRole="button"
              accessibilityLabel="Allow notifications"
            >
              <Text style={styles.primaryButtonText}>
                {isEnglish ? 'Allow' : 'অনুমতি দিন'}
              </Text>
            </Pressable>
          </View>
        </View>
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
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  contextCard: {
    backgroundColor: Colors.tintBrand,
    borderRadius: Radius.lg,
    padding: Spacing.md + 2,
  },
  contextTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 4,
  },
  contextSub: {
    fontSize: FontSizes.xs + 1,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  dialogCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.tintBrand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  innerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
  },
  dialogTitle: {
    fontSize: FontSizes.md + 1,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 24,
    marginBottom: Spacing.xs + 2,
  },
  dialogDescription: {
    fontSize: FontSizes.xs + 1,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: Spacing.xl,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  outlineButton: {
    flex: 1,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  outlineButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  primaryButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
