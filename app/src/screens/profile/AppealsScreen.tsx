/**
 * AppealsScreen — every appeal the user has made: running ones (under review)
 * and past ones (accepted or rejected), with the case, the reason given, the
 * moderator's decision note and dates. Tapping a card opens Account status,
 * where new appeals are submitted.
 */

import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { ChipGroup } from '../../components/Chip';
import { StateView } from '../../components/StateView';
import { AppealRecord, moderationApi } from '../../api/moderation';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { formatDate } from '../../utils/format';
import { APPEAL_REASONS } from './AccountStatusScreen';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Tab = 'running' | 'past';

export function AppealsScreen() {
  const { navigation } = useAppNavigation();
  const { tx, isEnglish } = useLanguage();
  const [tab, setTab] = useState<Tab>('running');
  const appeals = useResource(() => moderationApi.appeals());

  const all = appeals.data ?? [];
  const running = all.filter((a) => a.status === 'pending');
  const past = all.filter((a) => a.status !== 'pending');
  const shown = tab === 'running' ? running : past;

  const status = (a: AppealRecord) =>
    a.status === 'pending'
      ? { label: tx('পর্যালোচনা চলছে', 'Under review'), color: Colors.tintAmberText, background: Colors.tintAmber }
      : a.status === 'accepted'
        ? { label: tx('গৃহীত', 'Accepted'), color: Colors.tintGreenText, background: Colors.tintGreen }
        : { label: tx('প্রত্যাখ্যাত', 'Rejected'), color: Colors.tintErrorText, background: Colors.tintError };

  const reasonLabel = (key: string) => {
    const found = APPEAL_REASONS.find((r) => r.key === key);
    return found ? (isEnglish ? found.en : found.bn) : key;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('আপিল', 'Appeals')} onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        <ChipGroup<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'running', label: `${tx('চলমান', 'Running')} · ${running.length}` },
            { value: 'past', label: `${tx('আগের', 'Past')} · ${past.length}` },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={appeals.isRefreshing} onRefresh={appeals.refresh} tintColor={Colors.primary} />}
      >
        {appeals.isLoading ? (
          <StateView kind="loading" />
        ) : appeals.error && !appeals.data ? (
          <StateView kind="error" message={appeals.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={appeals.reload} />
        ) : shown.length === 0 ? (
          <StateView
            kind="empty"
            title={tab === 'running' ? tx('কোনো চলমান আপিল নেই', 'No running appeals') : tx('আগের কোনো আপিল নেই', 'No past appeals')}
            message={tx(
              'আপনার কনটেন্টে ব্যবস্থা নেওয়া হলে অ্যাকাউন্ট স্ট্যাটাস থেকে আপিল করতে পারবেন।',
              'If action is taken on your content, you can appeal from Account status.',
            )}
            actionLabel={tx('অ্যাকাউন্ট স্ট্যাটাস', 'Account status')}
            onAction={() => navigation.navigate('AccountStatus')}
          />
        ) : (
          shown.map((a) => {
            const look = status(a);
            return (
              <Pressable
                key={a.id}
                onPress={() => navigation.navigate('AccountStatus')}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${a.audiobook?.title ?? ''}, ${look.label}`}
              >
                <View style={styles.head}>
                  <Text style={styles.title} numberOfLines={2}>
                    {a.audiobook?.title ?? tx('মুছে ফেলা অডিওবুক', 'Deleted audiobook')}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: look.background }]}>
                    <Text style={[styles.badgeText, { color: look.color }]}>{look.label}</Text>
                  </View>
                </View>

                {a.violation_label ? (
                  <Text style={styles.meta}>
                    {tx('লঙ্ঘন', 'Violation')}: {a.violation_label}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {tx('কারণ', 'Reason')}: {reasonLabel(a.reason)}
                </Text>
                {a.explanation ? (
                  <Text style={styles.explanation} numberOfLines={4}>
                    {a.explanation}
                  </Text>
                ) : null}

                {a.decision_note ? (
                  <View style={styles.note}>
                    <Text style={styles.noteLabel}>{tx('মডারেটরের বার্তা', 'Moderator note')}</Text>
                    <Text style={styles.noteText}>{a.decision_note}</Text>
                  </View>
                ) : null}

                <View style={styles.footer}>
                  <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.footerText}>
                    {tx('জমা', 'Submitted')} {formatDate(a.created_at, isEnglish)}
                    {a.decided_at ? ` · ${tx('সিদ্ধান্ত', 'Decided')} ${formatDate(a.decided_at, isEnglish)}` : ''}
                    {a.files ? ` · ${tx(`${a.files}টি ফাইল`, `${a.files} ${a.files === 1 ? 'file' : 'files'}`)}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabs: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    gap: 6,
  },
  pressed: {
    opacity: 0.75,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  title: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  meta: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  explanation: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  note: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 2,
    marginTop: 2,
  },
  noteLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  noteText: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  footerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
});
