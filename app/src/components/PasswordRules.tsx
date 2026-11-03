/**
 * Password rules shared by sign-up and password reset (the server checks the
 * same): at least 8 characters, a letter, a number, and both entries matching.
 * `PasswordRules` shows them as a live checklist under the fields.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { Colors, FontSizes, Spacing } from '../theme';

export function passwordChecks(password: string, confirm: string) {
  return {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
    match: password.length > 0 && password === confirm,
  };
}

export function passwordValid(password: string, confirm: string): boolean {
  return Object.values(passwordChecks(password, confirm)).every(Boolean);
}

export function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  const { tx } = useLanguage();
  const checks = passwordChecks(password, confirm);
  const rows: [boolean, string][] = [
    [checks.length, tx('অন্তত ৮ অক্ষর', 'At least 8 characters')],
    [checks.letter, tx('অন্তত একটি অক্ষর (a-z)', 'At least one letter')],
    [checks.number, tx('অন্তত একটি সংখ্যা (0-9)', 'At least one number')],
    [checks.match, tx('দুটি পাসওয়ার্ড মিলেছে', 'Both passwords match')],
  ];
  return (
    <View style={styles.box} accessibilityLabel={tx('পাসওয়ার্ডের শর্ত', 'Password requirements')}>
      {rows.map(([ok, label]) => (
        <View key={label} style={styles.row}>
          <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? Colors.success : Colors.textMuted} />
          <Text style={[styles.text, ok && styles.ok]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 4,
    paddingHorizontal: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  ok: {
    color: Colors.success,
  },
});
