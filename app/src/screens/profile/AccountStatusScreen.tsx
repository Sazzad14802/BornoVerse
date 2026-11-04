/**
 * AccountStatusScreen — the owner's moderation notices and appeals.
 * Shows account standing (strikes, publishing restriction) and each case:
 * the violation, exactly the actions taken, the appeal deadline, and an
 * appeal form (reason, explanation, supporting documents).
 */

import React, { useState } from 'react';
import { AppAlert } from '../../components/AppAlert';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { ModalBottomSheet, SheetScrollView } from '../../components/ModalBottomSheet';
import { StateView } from '../../components/StateView';
import { AppealReason, ModerationAction, ModerationCase, moderationApi } from '../../api/moderation';
import { errorMessage } from '../../api/client';
import { PickedFile } from '../../api/upload';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResource } from '../../hooks/useResource';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { formatDate } from '../../utils/format';
import { pickEvidence } from '../../utils/pickers';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

const VIOLATIONS: Record<string, [string, string]> = {
  sexual_content: ['যৌন কনটেন্ট', 'Sexual content'],
  copyright: ['কপিরাইট লঙ্ঘন', 'Copyright violation'],
  plagiarism: ['চৌর্যবৃত্তি', 'Plagiarism'],
  fake_account: ['ভুয়া অ্যাকাউন্ট', 'Fake account'],
  illegal: ['বেআইনি কনটেন্ট', 'Illegal content'],
  harassment: ['হয়রানি', 'Harassment'],
  misleading: ['বিভ্রান্তিকর কনটেন্ট', 'Misleading content'],
  other: ['অন্যান্য', 'Other'],
};

/** Violation name in the app language. */
export function violationName(key: string, english: boolean): string {
  const pair = VIOLATIONS[key] ?? VIOLATIONS.other;
  return english ? pair[1] : pair[0];
}

export const APPEAL_REASONS: { key: AppealReason; bn: string; en: string }[] = [
  { key: 'own_rights', bn: 'আমি এর স্বত্বাধিকারী', en: 'I own the rights' },
  { key: 'have_permission', bn: 'আমার অনুমতি/লাইসেন্স আছে', en: 'I have permission or a licence' },
  { key: 'original_work', bn: 'এটি আমার মৌলিক কাজ', en: 'It is my original work' },
  { key: 'report_mistaken', bn: 'রিপোর্টটি ভুল', en: 'The report is mistaken' },
  { key: 'other', bn: 'অন্যান্য', en: 'Other' },
];

const MAX_FILES = 5;

export function AccountStatusScreen() {
  const { navigation } = useAppNavigation();
  const { tx, isEnglish } = useLanguage();
  const data = useResource(() => moderationApi.standing());

  const [appealing, setAppealing] = useState<ModerationCase | null>(null);
  const [reason, setReason] = useState<AppealReason>('own_rights');
  const [explanation, setExplanation] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const violation = (key: string) => {
    const pair = VIOLATIONS[key] ?? VIOLATIONS.other;
    return isEnglish ? pair[1] : pair[0];
  };

  const describe = (a: ModerationAction): { icon: React.ComponentProps<typeof Ionicons>['name']; text: string } => {
    switch (a.kind) {
      case 'hide':
        return { icon: 'eye-off-outline', text: tx('কনটেন্ট সাময়িকভাবে লুকানো হয়েছে', 'Content temporarily hidden') };
      case 'restrict':
        return {
          icon: 'time-outline',
          text: tx(`প্রকাশ ${a.details.days} দিনের জন্য সীমিত`, `Publishing restricted for ${a.details.days} days`),
        };
      case 'strike':
        return { icon: 'warning-outline', text: tx(`স্ট্রাইক যোগ হয়েছে (মোট ${a.details.total})`, `Strike recorded (total ${a.details.total})`) };
      case 'delete':
        return { icon: 'trash-outline', text: tx('কনটেন্ট সরানো হয়েছে', 'Content removed') };
      case 'suspend':
        return { icon: 'ban-outline', text: tx('অ্যাকাউন্ট স্থগিত', 'Account suspended') };
      default:
        return { icon: 'mail-outline', text: tx('মডারেশন নোটিশ পাঠানো হয়েছে', 'Moderation notice sent') };
    }
  };

  const openAppeal = (c: ModerationCase) => {
    setReason('own_rights');
    setExplanation('');
    setFiles([]);
    setAppealing(c);
  };

  const addFile = async () => {
    try {
      const picked = await pickEvidence();
      if (picked) setFiles((current) => [...current, picked].slice(0, MAX_FILES));
    } catch (error) {
      AppAlert.alert(tx('ফাইল', 'File'), errorMessage(error));
    }
  };

  const submitAppeal = async () => {
    if (!appealing) return;
    if (explanation.trim().length < 10) {
      AppAlert.alert(tx('ব্যাখ্যা দিন', 'Add an explanation'), tx('অন্তত ১০ অক্ষরে আপনার পক্ষে ব্যাখ্যা লিখুন।', 'Explain your side in at least 10 characters.'));
      return;
    }
    setBusy(true);
    try {
      const appeal = await moderationApi.appeal(appealing.report_id, reason, explanation.trim());
      for (const file of files) {
        await moderationApi.appealEvidence(appeal.id, file).catch(() => undefined);
      }
      setAppealing(null);
      await data.reload();
      AppAlert.alert(tx('আপিল জমা হয়েছে', 'Appeal submitted'), tx('মডারেশন টিম পর্যালোচনা করে জানাবে।', 'Our moderation team will review it and notify you.'));
    } catch (error) {
      AppAlert.alert(tx('আপিল করা যায়নি', 'Could not appeal'), errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const standing = data.data;
  const restricted = standing?.publishing_restricted_until;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader title={tx('অ্যাকাউন্ট স্ট্যাটাস', 'Account status')} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={data.refresh} tintColor={Colors.primary} />}
      >
        {data.isLoading ? (
          <StateView kind="loading" />
        ) : data.error && !standing ? (
          <StateView kind="error" message={data.error} actionLabel={tx('আবার চেষ্টা', 'Retry')} onAction={data.reload} />
        ) : standing ? (
          <>
            <View style={[styles.standing, (standing.strikes > 0 || restricted) && styles.standingWarn]}>
              <Ionicons
                name={standing.strikes || restricted ? 'shield-outline' : 'shield-checkmark-outline'}
                size={26}
                color={standing.strikes || restricted ? Colors.tintAmberText : Colors.success}
              />
              <View style={styles.standingText}>
                <Text style={styles.standingTitle}>
                  {standing.strikes || restricted ? tx('অ্যাকাউন্টে সতর্কতা আছে', 'Your account has warnings') : tx('অ্যাকাউন্ট ভালো অবস্থায় আছে', 'Your account is in good standing')}
                </Text>
                <Text style={styles.standingMeta}>
                  {tx(`সক্রিয় স্ট্রাইক: ${standing.strikes}`, `Active strikes: ${standing.strikes}`)}
                  {restricted ? ` · ${tx(`প্রকাশ সীমিত ${formatDate(restricted, false)} পর্যন্ত`, `Publishing restricted until ${formatDate(restricted, true)}`)}` : ''}
                </Text>
              </View>
            </View>

            {standing.cases.length === 0 ? (
              <StateView
                kind="empty"
                compact
                title={tx('কোনো মডারেশন নোটিশ নেই', 'No moderation notices')}
                message={tx('আপনার কনটেন্ট নিয়ে কোনো ব্যবস্থা নেওয়া হয়নি।', 'No action has been taken on your content.')}
              />
            ) : (
              standing.cases.map((c) => (
                <View key={c.report_id} style={styles.case}>
                  <View style={styles.caseHead}>
                    <Text style={styles.caseTitle} numberOfLines={2}>
                      {c.audiobook.title}
                    </Text>
                    <View style={[styles.badge, c.status === 'resolved' ? styles.badgeDone : styles.badgeOpen]}>
                      <Text style={[styles.badgeText, c.status === 'resolved' ? styles.badgeTextDone : styles.badgeTextOpen]}>
                        {c.status === 'appealed'
                          ? tx('আপিল চলছে', 'Appeal pending')
                          : c.status === 'resolved'
                            ? tx('নিষ্পত্তি', 'Resolved')
                            : tx('ব্যবস্থা নেওয়া হয়েছে', 'Action taken')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.violation}>{tx('লঙ্ঘন', 'Violation')}: {violation(c.violation)}</Text>

                  <View style={styles.actions}>
                    {c.actions.map((a) => {
                      const d = describe(a);
                      return (
                        <View key={a.id} style={styles.action}>
                          <Ionicons name={d.icon} size={16} color={a.reversed ? Colors.textMuted : Colors.textPrimary} />
                          <Text style={[styles.actionText, a.reversed && styles.reversed]}>{d.text}</Text>
                          {a.reversed ? <Text style={styles.reversedTag}>{tx('প্রত্যাহার', 'Reversed')}</Text> : null}
                        </View>
                      );
                    })}
                  </View>

                  {c.appeal ? (
                    <View style={styles.appealBox}>
                      <Text style={styles.appealTitle}>
                        {c.appeal.status === 'pending'
                          ? tx('আপিল পর্যালোচনা চলছে', 'Your appeal is under review')
                          : c.appeal.status === 'accepted'
                            ? tx('আপিল গৃহীত হয়েছে', 'Your appeal was accepted')
                            : tx('আপিল প্রত্যাখ্যাত হয়েছে', 'Your appeal was rejected')}
                      </Text>
                      {c.appeal.decision_note ? <Text style={styles.appealNote}>{c.appeal.decision_note}</Text> : null}
                    </View>
                  ) : null}

                  {c.can_appeal ? (
                    <>
                      <Text style={styles.deadline}>
                        {tx(
                          `আপিলের শেষ সময়: ${formatDate(c.appeal_deadline, false)}`,
                          `Appeal by ${formatDate(c.appeal_deadline, true)}`,
                        )}
                      </Text>
                      <AppButton label={tx('আপিল করুন', 'Submit an appeal')} variant="secondary" onPress={() => openAppeal(c)} />
                    </>
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      <ModalBottomSheet visible={!!appealing} onClose={() => setAppealing(null)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{tx('আপিল করুন', 'Submit an appeal')}</Text>
          <Text style={styles.sheetSub} numberOfLines={2}>
            {appealing?.audiobook.title}
          </Text>
          <SheetScrollView maxHeight={460}>
            <View style={styles.form}>
              <Text style={styles.label}>{tx('আপিলের কারণ', 'Reason')}</Text>
              {APPEAL_REASONS.map((r) => {
                const selected = reason === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => setReason(r.key)}
                    style={[styles.option, selected && styles.optionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? Colors.primary : Colors.textMuted} />
                    <Text style={styles.optionText}>{isEnglish ? r.en : r.bn}</Text>
                  </Pressable>
                );
              })}
              <Text style={styles.label}>{tx('আপনার ব্যাখ্যা', 'Your explanation')}</Text>
              <TextInput
                style={styles.input}
                value={explanation}
                onChangeText={setExplanation}
                placeholder={tx('কেন সিদ্ধান্তটি ভুল মনে করছেন লিখুন', 'Explain why you believe the decision is wrong')}
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={5000}
              />
              <Text style={styles.label}>{tx('সহায়ক কাগজপত্র (ঐচ্ছিক)', 'Supporting documents (optional)')}</Text>
              <Text style={styles.hint}>
                {tx(
                  'যেমন: মালিকানার সনদ, কপিরাইট অনুমতি, লাইসেন্স চুক্তি বা মৌলিক রচনার প্রমাণ।',
                  'For example: ownership certificate, copyright permission, licence agreement or proof of authorship.',
                )}
              </Text>
              {files.map((file, i) => (
                <View key={`${file.name}-${i}`} style={styles.file}>
                  <Ionicons name="document-attach-outline" size={18} color={Colors.primary} />
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))} hitSlop={8}>
                    <Ionicons name="close" size={18} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
              {files.length < MAX_FILES ? (
                <AppButton label={tx('ফাইল যোগ করুন', 'Add file')} icon="attach" variant="text" fullWidth={false} onPress={addFile} />
              ) : null}
            </View>
          </SheetScrollView>
          <AppButton label={tx('আপিল জমা দিন', 'Submit appeal')} onPress={submitAppeal} isLoading={busy} />
        </View>
      </ModalBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  standing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.tintGreen,
  },
  standingWarn: {
    backgroundColor: Colors.tintAmber,
  },
  standingText: {
    flex: 1,
    gap: 2,
  },
  standingTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  standingMeta: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  case: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  caseHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  caseTitle: {
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
  badgeOpen: {
    backgroundColor: Colors.tintAmber,
  },
  badgeDone: {
    backgroundColor: Colors.surfaceElevated,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  badgeTextOpen: {
    color: Colors.tintAmberText,
  },
  badgeTextDone: {
    color: Colors.textSecondary,
  },
  violation: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  actions: {
    gap: 6,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  reversed: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  reversedTag: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.success,
  },
  appealBox: {
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated,
    gap: 2,
  },
  appealTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  appealNote: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  deadline: {
    fontSize: FontSizes.xs,
    color: Colors.tintAmberText,
    fontWeight: '600',
  },
  sheet: {
    gap: Spacing.sm,
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sheetSub: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  form: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  label: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  hint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  input: {
    minHeight: 100,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated,
  },
  fileName: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
});
