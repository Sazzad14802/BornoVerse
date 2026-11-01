/**
 * ReportSheet — report an audiobook: category (required), explanation
 * (optional; required for "Other") and up to three evidence files (optional).
 * A listener can report the same audiobook only once.
 */

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { ModalBottomSheet, SheetScrollView } from './ModalBottomSheet';
import { moderationApi, ReportCategory } from '../api/moderation';
import { ApiError, errorMessage } from '../api/client';
import { PickedFile } from '../api/upload';
import { useLanguage } from '../contexts/LanguageContext';
import { pickEvidence } from '../utils/pickers';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

const CATEGORIES: { key: ReportCategory; bn: string; en: string; hintBn: string; hintEn: string }[] = [
  { key: 'sexual_content', bn: 'যৌন কনটেন্ট', en: 'Sexual content', hintBn: 'অশ্লীল বা অনুপযুক্ত যৌন বিষয়', hintEn: 'Explicit or inappropriate sexual material' },
  { key: 'copyright', bn: 'কপিরাইট লঙ্ঘন', en: 'Copyright violation', hintBn: 'অনুমতি ছাড়া কপিরাইটযুক্ত অডিওবুক', hintEn: 'Unauthorised copyrighted audiobook' },
  { key: 'plagiarism', bn: 'চৌর্যবৃত্তি', en: 'Plagiarism', hintBn: 'যথাযথ কৃতিত্ব ছাড়া নকল কনটেন্ট', hintEn: 'Copied content without proper attribution' },
  { key: 'fake_account', bn: 'ভুয়া অ্যাকাউন্ট', en: 'Fake account', hintBn: 'সন্দেহজনক বা ছদ্মবেশী অ্যাকাউন্ট', hintEn: 'Suspicious or impersonating account' },
  { key: 'illegal', bn: 'বেআইনি কনটেন্ট', en: 'Illegal content', hintBn: 'প্রযোজ্য আইন ভঙ্গ করে এমন কনটেন্ট', hintEn: 'Content violating applicable laws' },
  { key: 'harassment', bn: 'হয়রানি', en: 'Harassment', hintBn: 'বুলিং, অপমানজনক বা লক্ষ্য করে আক্রমণ', hintEn: 'Bullying, abusive or targeted content' },
  { key: 'misleading', bn: 'বিভ্রান্তিকর কনটেন্ট', en: 'Misleading content', hintBn: 'ভুয়া বা প্রতারণামূলক তথ্য', hintEn: 'Fake or deceptive information' },
  { key: 'other', bn: 'অন্যান্য', en: 'Other', hintBn: 'নিজের ভাষায় কারণ লিখুন', hintEn: 'Describe the problem yourself' },
];
const MAX_FILES = 3;

interface ReportSheetProps {
  audiobookId: string;
  visible: boolean;
  onClose: () => void;
}

export function ReportSheet({ audiobookId, visible, onClose }: ReportSheetProps) {
  const { tx, isEnglish } = useLanguage();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCategory(null);
    setDetails('');
    setFiles([]);
  };

  const addFile = async () => {
    try {
      const picked = await pickEvidence();
      if (picked) setFiles((current) => [...current, picked].slice(0, MAX_FILES));
    } catch (error) {
      Alert.alert(tx('ফাইল', 'File'), errorMessage(error));
    }
  };

  const submit = async () => {
    if (!category) return;
    if (category === 'other' && details.trim().length < 5) {
      Alert.alert(tx('কারণ লিখুন', 'Describe the problem'), tx('"অন্যান্য" বেছে নিলে কারণটি লিখুন।', 'Please describe the problem when choosing Other.'));
      return;
    }
    setBusy(true);
    try {
      const report = await moderationApi.report(audiobookId, category, details.trim());
      for (const file of files) {
        await moderationApi.reportEvidence(report.id, file).catch(() => undefined);
      }
      reset();
      onClose();
      Alert.alert(
        tx('রিপোর্ট জমা হয়েছে', 'Report submitted'),
        tx('ধন্যবাদ। আমাদের মডারেশন টিম এটি পর্যালোচনা করবে।', 'Thank you. Our moderation team will review it.'),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        Alert.alert(tx('আগেই রিপোর্ট করেছেন', 'Already reported'), tx('এই অডিওবুকটি আপনি আগেই রিপোর্ট করেছেন।', 'You have already reported this audiobook.'));
      } else {
        Alert.alert(tx('রিপোর্ট করা যায়নি', 'Could not report'), errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalBottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>{tx('অডিওবুক রিপোর্ট করুন', 'Report audiobook')}</Text>
        <Text style={styles.subtitle}>{tx('কী সমস্যা? একটি বেছে নিন।', 'What is wrong? Choose one.')}</Text>
        <SheetScrollView maxHeight={460}>
          <View style={styles.list}>
            {CATEGORIES.map((c) => {
              const selected = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{isEnglish ? c.en : c.bn}</Text>
                    <Text style={styles.optionHint}>{isEnglish ? c.hintEn : c.hintBn}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Text style={styles.label}>
              {category === 'other' ? tx('কারণ (আবশ্যক)', 'Reason (required)') : tx('আরও কিছু বলতে চান? (ঐচ্ছিক)', 'Anything to add? (optional)')}
            </Text>
            <TextInput
              style={styles.input}
              value={details}
              onChangeText={setDetails}
              placeholder={tx('কী দেখেছেন বা শুনেছেন লিখুন', 'Describe what you saw or heard')}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={2000}
            />

            <Text style={styles.label}>{tx('প্রমাণ (ঐচ্ছিক, PDF বা ছবি)', 'Evidence (optional, PDF or image)')}</Text>
            {files.map((file, i) => (
              <View key={`${file.name}-${i}`} style={styles.file}>
                <Ionicons name="document-attach-outline" size={18} color={Colors.primary} />
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
                <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel={tx('সরান', 'Remove')}>
                  <Ionicons name="close" size={18} color={Colors.textSecondary} />
                </Pressable>
              </View>
            ))}
            {files.length < MAX_FILES ? (
              <AppButton label={tx('ফাইল যোগ করুন', 'Add file')} icon="attach" variant="text" fullWidth={false} onPress={addFile} />
            ) : null}
          </View>
        </SheetScrollView>
        <AppButton label={tx('রিপোর্ট জমা দিন', 'Submit report')} onPress={submit} isLoading={busy} disabled={!category} />
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  list: {
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  pressed: {
    opacity: 0.8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  optionHint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  label: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  input: {
    minHeight: 84,
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
