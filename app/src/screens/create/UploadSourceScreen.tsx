/**
 * UploadSourceScreen — step 2 of 3: provide the content.
 *
 * The PDF is uploaded, then an AI generation job is started immediately
 * (Gemini OCR → Gemini TTS, one chapter per page) and the user follows progress.
 * Finished MP3 narration is uploaded by publishers from their channel instead.
 */

import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { audiobooksApi } from '../../api/audiobooks';
import { generationApi } from '../../api/generation';
import { ApiError, errorMessage } from '../../api/client';
import { PickedFile } from '../../api/upload';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { CreateStackParamList } from '../../navigation/types';
import { MAX_DOCUMENT_MB, pickDocument } from '../../utils/pickers';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Stage = 'idle' | 'uploading' | 'starting';

export function UploadSourceScreen() {
  const { navigation } = useAppNavigation();
  const { audiobookId, title } = useRoute<RouteProp<CreateStackParamList, 'UploadSource'>>().params;
  const { tx } = useLanguage();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [uploaded, setUploaded] = useState(false);

  const choose = async () => {
    try {
      const picked = await pickDocument('pdf');
      if (picked) setFile(picked);
    } catch (error) {
      Alert.alert(tx('ফাইল', 'File'), errorMessage(error));
    }
  };

  const startGeneration = async () => {
    setStage('starting');
    try {
      await generationApi.start(audiobookId);
      navigation.replace('GenerationStatus', { audiobookId });
    } catch (error) {
      const quota = error instanceof ApiError && error.status === 429;
      Alert.alert(
        quota ? tx('মাসিক কোটা শেষ', 'Monthly quota reached') : tx('শুরু করা যায়নি', 'Could not start'),
        errorMessage(error),
      );
    } finally {
      setStage('idle');
    }
  };

  const submit = async () => {
    if (!file) return;
    setStage('uploading');
    try {
      if (!uploaded) {
        await audiobooksApi.uploadSource(audiobookId, file);
        setUploaded(true);
      }
      await startGeneration();
    } catch (error) {
      Alert.alert(tx('আপলোড ব্যর্থ', 'Upload failed'), errorMessage(error));
    } finally {
      setStage('idle');
    }
  };

  const busyLabel =
    stage === 'uploading'
      ? tx('আপলোড হচ্ছে…', 'Uploading…')
      : stage === 'starting'
        ? tx('অডিও তৈরি শুরু হচ্ছে…', 'Starting generation…')
        : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('ফাইল আপলোড', 'Upload file')}
        subtitle={tx(`ধাপ ২/৩ · ${title}`, `Step 2 of 3 · ${title}`)}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable
          style={({ pressed }) => [styles.dropZone, file && styles.dropZoneFilled, pressed && styles.pressed]}
          onPress={choose}
          disabled={stage !== 'idle'}
          accessibilityRole="button"
        >
          <Ionicons
            name={file ? 'checkmark-circle' : 'document-text-outline'}
            size={34}
            color={file ? Colors.success : Colors.primary}
          />
          <Text style={styles.dropTitle} numberOfLines={2}>
            {file ? file.name : tx('PDF ফাইল বেছে নিন', 'Choose a PDF')}
          </Text>
          <Text style={styles.dropHint}>
            {file
              ? tx('বদলাতে আবার চাপুন', 'Tap to change')
              : tx(`সর্বোচ্চ ${MAX_DOCUMENT_MB} MB`, `Up to ${MAX_DOCUMENT_MB} MB`)}
          </Text>
        </Pressable>

        <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{tx('কীভাবে কাজ করে', 'How it works')}</Text>
            {[
              tx('১. Gemini AI প্রতিটি পৃষ্ঠার লেখা পড়ে নেয় (স্ক্যান করা বইও)।', '1. Gemini AI reads the text on every page (scanned books too).'),
              tx('২. প্রতিটি পৃষ্ঠা স্বাভাবিক কণ্ঠে বর্ণিত হয়ে একটি অধ্যায় হয়।', '2. Each page is narrated in a natural voice as one chapter.'),
              tx('৩. প্রথম পৃষ্ঠা তৈরি হলেই শোনা শুরু করা যায়; শেষ হলে নোটিফিকেশন পাবেন।', '3. Start listening once the first page is ready; you are notified when it finishes.'),
            ].map((line) => (
              <Text key={line} style={styles.infoLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.infoNote}>
              {tx('১–১০০০ পৃষ্ঠার, পাসওয়ার্ড ছাড়া PDF দিন।', 'Use an unencrypted PDF with 1–1000 pages.')}
            </Text>
          </View>

        <AppButton
          label={
            busyLabel ??
            (uploaded
              ? tx('অডিও তৈরি শুরু করুন', 'Start generating audio')
              : tx('আপলোড করে অডিও তৈরি করুন', 'Upload & generate audio'))
          }
          onPress={submit}
          isLoading={stage !== 'idle'}
          disabled={!file}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.textMuted,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dropZoneFilled: {
    borderStyle: 'solid',
    borderColor: Colors.success,
    backgroundColor: Colors.tintGreen,
  },
  pressed: {
    opacity: 0.8,
  },
  dropTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  dropHint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.tintBlue,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 6,
  },
  infoTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.tintBlueText,
  },
  infoLine: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  infoNote: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
