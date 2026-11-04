/**
 * LanguageSelectScreen — Language selection matching Figma Plate 1 Screen 5.
 * Bangla, English, and Bangla + English options.
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { AppLanguage } from '../../storage/languageStorage';

interface LanguageSelectScreenProps {
  onBack?: () => void;
  onContinue: (lang: AppLanguage) => void;
}

export function LanguageSelectScreen({ onBack, onContinue }: LanguageSelectScreenProps) {
  const { language, setLanguage, t, isEnglish } = useLanguage();

  const handleSelect = async (lang: AppLanguage) => {
    await setLanguage(lang);
  };

  const handleContinue = async () => {
    onContinue(language);
  };

  const options = [
    {
      id: 'bn' as const,
      title: 'বাংলা',
      subtitle:
        language === 'bn'
          ? isEnglish
            ? 'Bangla UI · Active'
            : 'বাংলা UI · সক্রিয়'
          : isEnglish
          ? 'Bangla interface'
          : 'বাংলা ইন্টারফেস',
      styleType: 'dark',
    },
    {
      id: 'en' as const,
      title: 'English',
      subtitle:
        language === 'en'
          ? isEnglish
            ? 'English UI · Active'
            : 'English UI · সক্রিয়'
          : isEnglish
          ? 'English interface'
          : 'ইংরেজি ইন্টারফেস',
      styleType: 'neutral',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <AppHeader
        title={t('langSelectTitle')}
        subtitle={t('langSelectSub')}
        onBack={onBack}
      />

      <View style={styles.content}>
        <View style={styles.optionsList}>
          {options.map((opt) => {
            const isSelected = language === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => handleSelect(opt.id)}
                style={({ pressed }) => [
                  styles.optionCard,
                  opt.styleType === 'dark' && styles.cardDark,
                  opt.styleType === 'neutral' && styles.cardNeutral,
                  opt.styleType === 'blue' && styles.cardBlue,
                  isSelected && styles.cardSelectedBorder,
                  pressed && styles.cardPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.cardTitle,
                    opt.styleType === 'dark' ? styles.textWhite : styles.textDark,
                  ]}
                >
                  {opt.title}
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    opt.styleType === 'dark' ? styles.subMutedWhite : styles.subMutedDark,
                  ]}
                >
                  {opt.subtitle}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* CTA Button */}
        <View style={styles.buttonWrapper}>
          <AppButton
            label={t('btnContinue')}
            onPress={handleContinue}
            variant="primary"
          />
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
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
  },
  optionsList: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  optionCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  cardDark: {
    backgroundColor: Colors.surfaceDark,
  },
  cardNeutral: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardBlue: {
    backgroundColor: Colors.tintBlue,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  cardSelectedBorder: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: FontSizes.xs + 1,
    marginTop: 4,
  },
  textWhite: {
    color: '#FFFFFF',
  },
  textDark: {
    color: Colors.textPrimary,
  },
  subMutedWhite: {
    color: Colors.textMuted,
  },
  subMutedDark: {
    color: Colors.textSecondary,
  },
  buttonWrapper: {
    marginTop: Spacing.md,
  },
});
