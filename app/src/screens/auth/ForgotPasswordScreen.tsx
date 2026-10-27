/**
 * ForgotPasswordScreen — password recovery in steps: email, verify, reset, done.
 * Connected to live backend: /api/v1/auth/recovery & /api/v1/auth/reset-password.
 */

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/types';
import { AppHeader } from '../../components/AppHeader';
import { AppButton } from '../../components/AppButton';
import { IconInput } from '../../components/Form';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../api/client';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen() {
  const nav = useNavigation<Nav>();
  const { t, isEnglish } = useLanguage();

  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1 = Enter Email, 2 = Verify & New Password, 3 = Success
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(isEnglish ? 'Please enter a valid email address.' : 'সঠিক ইমেইল ঠিকানা লিখুন।');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/recovery', {
        email: email.trim().toLowerCase(),
      });
      setInfoMessage(
        isEnglish
          ? 'If the account exists, a recovery code has been sent. Check your email.'
          : 'অ্যাকাউন্টটি থাকলে একটি রিকভারি কোড ইমেইলে পাঠানো হয়েছে।'
      );
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.detail || err.message || 'Could not send recovery email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!verificationCode.trim()) {
      setErrorMessage(isEnglish ? 'Please enter the verification code.' : 'ভেরিফিকেশন কোডটি লিখুন।');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage(isEnglish ? 'Password must be at least 6 characters.' : 'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        token: verificationCode.trim(),
        password: newPassword,
      });
      setStep(3);
    } catch (err: any) {
      setErrorMessage(err.detail || err.message || 'Invalid or expired recovery code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('forgotHeaderTitle')}
        subtitle={t('forgotHeaderSub')}
        onBack={() => nav.goBack()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 4-Step Indicator Bar */}
          <View style={styles.stepIndicatorRow}>
            <View style={styles.stepColumn}>
              <View style={[styles.stepBar, styles.stepBarActive]} />
              <Text style={[styles.stepText, styles.stepTextActive]}>{t('forgotStepEmail')}</Text>
            </View>

            <View style={styles.stepColumn}>
              <View style={[styles.stepBar, step >= 2 && styles.stepBarActive]} />
              <Text style={[styles.stepText, step >= 2 && styles.stepTextActive]}>{t('forgotStepVerify')}</Text>
            </View>

            <View style={styles.stepColumn}>
              <View style={[styles.stepBar, step >= 2 && styles.stepBarActive]} />
              <Text style={[styles.stepText, step >= 2 && styles.stepTextActive]}>{t('forgotStepReset')}</Text>
            </View>

            <View style={styles.stepColumn}>
              <View style={[styles.stepBar, step === 3 && styles.stepBarActive]} />
              <Text style={[styles.stepText, step === 3 && styles.stepTextActive]}>{t('forgotStepSuccess')}</Text>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.fieldsContainer}>
            {step === 1 && (
              <View style={styles.fieldWrapper}>
                <Text style={styles.fieldLabel}>{t('forgotEmailLabel')}</Text>
                <IconInput
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder={isEnglish ? 'Email' : 'ইমেইল'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            )}

            {step === 2 && (
              <>
                <View style={styles.fieldWrapper}>
                  <Text style={styles.fieldLabel}>{t('forgotVerifyCodeLabel')}</Text>
                  <IconInput
                    icon="key-outline"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    placeholder={isEnglish ? 'Code from the email' : 'ইমেইলে পাওয়া কোড'}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldWrapper}>
                  <Text style={styles.fieldLabel}>{t('forgotNewPasswordLabel')}</Text>
                  <IconInput
                    icon="lock-closed-outline"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder={isEnglish ? 'At least 6 characters' : 'অন্তত ৬ অক্ষর'}
                    secret
                    autoCapitalize="none"
                    autoComplete="new-password"
                  />
                </View>
              </>
            )}
          </View>

          {/* Messages */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {infoMessage ? (
            <View style={styles.verificationBanner}>
              <Text style={styles.verificationTitle}>{t('forgotBannerTitle')}</Text>
              <Text style={styles.verificationSub}>{infoMessage}</Text>
            </View>
          ) : null}

          {/* CTA Buttons */}
          {step === 1 && (
            <AppButton
              label={isEnglish ? 'Send Recovery Code' : 'রিকভারি কোড পাঠান'}
              onPress={handleSendCode}
              variant="primary"
              isLoading={isSubmitting}
            />
          )}

          {step === 2 && (
            <AppButton
              label={t('btnChangePassword')}
              onPress={handleResetPassword}
              variant="primary"
              isLoading={isSubmitting}
            />
          )}

          {/* Success State */}
          {step === 3 && (
            <View style={styles.successBanner}>
              <Text style={styles.successTitle}>{t('forgotSuccessTitle')}</Text>
              <Text style={styles.successSub}>
                {isEnglish
                  ? 'Your password has been reset successfully. Please sign in with your new password.'
                  : 'পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে। নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।'}
              </Text>
              <View style={{ marginTop: Spacing.md }}>
                <AppButton
                  label={t('tabSignIn')}
                  onPress={() => nav.navigate('Login')}
                  variant="primary"
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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
  stepIndicatorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  stepColumn: {
    flex: 1,
  },
  stepBar: {
    height: 3,
    backgroundColor: Colors.track,
    borderRadius: Radius.full,
    marginBottom: 4,
  },
  stepBarActive: {
    backgroundColor: Colors.primary,
  },
  stepText: {
    fontSize: FontSizes.xs - 1,
    color: Colors.textSecondary,
  },
  stepTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  fieldsContainer: {
    gap: Spacing.sm + 4,
  },
  fieldWrapper: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  textInput: {
    height: 50,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  passwordRow: {
    height: 50,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  eyeButton: {
    padding: Spacing.xs,
  },
  errorBanner: {
    backgroundColor: Colors.tintError,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSizes.xs,
    color: Colors.tintErrorText,
    fontWeight: '600',
  },
  verificationBanner: {
    backgroundColor: Colors.tintGreen,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  verificationTitle: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '700',
    color: Colors.tintGreenText,
    marginBottom: 2,
  },
  verificationSub: {
    fontSize: FontSizes.xs,
    color: Colors.tintGreenText,
  },
  successBanner: {
    backgroundColor: Colors.tintGreen,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  successTitle: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '700',
    color: Colors.tintGreenText,
    marginBottom: 2,
  },
  successSub: {
    fontSize: FontSizes.xs,
    color: Colors.tintGreenText,
  },
});
