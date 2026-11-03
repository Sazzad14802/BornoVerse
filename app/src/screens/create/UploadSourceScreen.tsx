/**
 * UploadSourceScreen — step 2 of 3: upload the book PDF.
 *
 * Choosing a file starts the upload straight away, with a progress ring and a
 * file row. The X on the file row cancels an upload in progress, or removes an
 * uploaded file so another one can be chosen. Once uploaded, "Generate audio"
 * starts the job (OCR, then narration, one chapter per page) and opens the
 * progress screen.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { ProgressRing } from '../../components/ProgressRing';
import { audiobooksApi } from '../../api/audiobooks';
import { generationApi } from '../../api/generation';
import { ApiError, errorMessage, UploadCancelled } from '../../api/client';
import { PickedFile } from '../../api/upload';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAppNavigation } from '../../navigation/useAppNavigation';
import { CreateStackParamList } from '../../navigation/types';
import { MAX_DOCUMENT_MB, pickDocument } from '../../utils/pickers';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Stage = 'empty' | 'uploading' | 'uploaded' | 'failed';

export function UploadSourceScreen() {
  const { navigation } = useAppNavigation();
  const { audiobookId, title } = useRoute<RouteProp<CreateStackParamList, 'UploadSource'>>().params;
  const { tx } = useLanguage();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [stage, setStage] = useState<Stage>('empty');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const controller = useRef<AbortController | null>(null);

  // Leaving the screen mid-upload cancels it.
  useEffect(() => () => controller.current?.abort(), []);

  const upload = async (picked: PickedFile) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setFile(picked);
    setStage('uploading');
    setProgress(0);
    setError(null);
    try {
      await audiobooksApi.uploadSource(audiobookId, picked, { onProgress: setProgress, signal: current.signal });
      if (controller.current !== current) return;
      setProgress(1);
      setStage('uploaded');
    } catch (e) {
      if (e instanceof UploadCancelled || controller.current !== current) return;
      setError(errorMessage(e));
      setStage('failed');
    }
  };

  const choose = async () => {
    try {
      const picked = await pickDocument('pdf');
      if (picked) await upload(picked);
    } catch (e) {
      Alert.alert(tx('ফাইল', 'File'), errorMessage(e));
    }
  };

  /** X: cancel the running upload, or discard the uploaded file to pick another. */
  const discard = () => {
    controller.current?.abort();
    controller.current = null;
    setFile(null);
    setStage('empty');
    setProgress(0);
    setError(null);
  };

  const generate = async () => {
    setStarting(true);
    try {
      await generationApi.start(audiobookId);
      navigation.replace('GenerationStatus', { audiobookId });
    } catch (e) {
      const quota = e instanceof ApiError && e.status === 429;
      Alert.alert(quota ? tx('মাসিক কোটা শেষ', 'Monthly quota reached') : tx('শুরু করা যায়নি', 'Could not start'), errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const heading =
    stage === 'uploading'
      ? tx('আপলোড হচ্ছে…', 'Uploading…')
      : stage === 'uploaded'
        ? tx('আপলোড সম্পন্ন', 'Upload complete')
        : stage === 'failed'
          ? tx('আপলোড হয়নি', 'Upload failed')
          : tx('বইয়ের PDF আপলোড করুন', 'Upload the book PDF');
  const message =
    stage === 'uploading'
      ? tx('ফাইলটি পাঠানো হচ্ছে, একটু অপেক্ষা করুন।', 'We are uploading your file, please wait a moment.')
      : stage === 'uploaded'
        ? tx('ঠিক আছে? এবার অডিও তৈরি শুরু করুন।', 'All set. Start generating the audio.')
        : stage === 'failed'
          ? error ?? ''
          : tx(`১–১০০০ পৃষ্ঠার, পাসওয়ার্ড ছাড়া PDF · সর্বোচ্চ ${MAX_DOCUMENT_MB} MB`, `Unencrypted PDF, 1–1000 pages · up to ${MAX_DOCUMENT_MB} MB`);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={tx('ফাইল আপলোড', 'Upload file')}
        subtitle={tx(`ধাপ ২/৩ · ${title}`, `Step 2 of 3 · ${title}`)}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          {stage === 'empty' ? (
            <Pressable
              onPress={choose}
              style={({ pressed }) => [styles.dropZone, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={tx('PDF বেছে নিন', 'Choose a PDF')}
            >
              <View style={styles.dropIcon}>
                <Ionicons name="cloud-upload-outline" size={34} color={Colors.primary} />
              </View>
              <Text style={styles.dropTitle}>{tx('PDF বেছে নিন', 'Choose a PDF')}</Text>
            </Pressable>
          ) : (
            <ProgressRing
              progress={progress}
              color={stage === 'failed' ? Colors.error : Colors.primary}
              caption={stage === 'uploaded' ? tx('১/১ ফাইল', '1/1 file') : stage === 'uploading' ? tx('০/১ ফাইল', '0/1 file') : undefined}
            />
          )}
          <Text style={styles.heading}>{heading}</Text>
          <Text style={[styles.message, stage === 'failed' && styles.messageError]}>{message}</Text>
        </View>

        {file ? (
          <View style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.fileBody}>
              <View style={styles.fileTop}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
                {stage === 'uploaded' ? (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                ) : null}
              </View>
              <Text style={styles.fileMeta}>
                {stage === 'uploaded' ? '100%' : stage === 'failed' ? tx('ব্যর্থ', 'Failed') : `${percent}%`}
              </Text>
              <View style={styles.fileTrack}>
                <View
                  style={[
                    styles.fileFill,
                    { width: `${stage === 'uploaded' ? 100 : percent}%` },
                    stage === 'failed' && styles.fileFillFailed,
                  ]}
                />
              </View>
            </View>
            <Pressable
              onPress={discard}
              hitSlop={10}
              style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={stage === 'uploading' ? tx('আপলোড বাতিল', 'Cancel upload') : tx('ফাইল সরান', 'Remove file')}
            >
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {stage === 'uploaded' ? (
          <AppButton label={tx('অডিও তৈরি করুন', 'Generate audio')} icon="sparkles-outline" onPress={generate} isLoading={starting} />
        ) : null}
        {stage === 'failed' && file ? (
          <AppButton label={tx('আবার চেষ্টা করুন', 'Try again')} icon="reload" onPress={() => upload(file)} />
        ) : null}
        {stage === 'uploaded' || stage === 'failed' ? (
          <AppButton label={tx('অন্য ফাইল বেছে নিন', 'Choose another file')} variant="text" onPress={choose} />
        ) : null}

        <View style={styles.steps}>
          {[
            { icon: 'scan-outline', text: tx('প্রতিটি পৃষ্ঠার লেখা পড়া হয় (স্ক্যান করা বইও)', 'The text of every page is read, scanned books too') },
            { icon: 'mic-outline', text: tx('প্রতিটি পৃষ্ঠা স্বাভাবিক কণ্ঠে একটি অধ্যায় হয়', 'Each page is narrated as one chapter') },
            { icon: 'notifications-outline', text: tx('প্রথম পৃষ্ঠা তৈরি হলেই শোনা যায়; শেষ হলে জানানো হবে', 'Listen as soon as page one is ready; you are notified at the end') },
          ].map((step) => (
            <View key={step.icon} style={styles.step}>
              <Ionicons name={step.icon as any} size={18} color={Colors.primary} />
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  dropZone: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  dropIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  heading: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  message: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  messageError: {
    color: Colors.tintErrorText,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm + 2,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileBody: {
    flex: 1,
    gap: 4,
  },
  fileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  fileName: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  fileMeta: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  fileTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.track,
    overflow: 'hidden',
  },
  fileFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  fileFillFailed: {
    backgroundColor: Colors.error,
  },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: {
    marginTop: Spacing.sm,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
});
