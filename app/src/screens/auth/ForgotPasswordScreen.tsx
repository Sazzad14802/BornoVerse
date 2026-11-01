/**
 * ForgotPasswordScreen — reset a password in three steps:
 * 1. email → a 6-digit code is emailed,
 * 2. enter the code (with a resend countdown),
 * 3. choose a new password (typed twice).
 * Afterwards the user signs in again with the new password.
 */

import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/types';
import { AppButton } from '../../components/AppButton';
import { IconInput } from '../../components/Form';
import { authApi } from '../../api/auth';
import { ApiError, errorMessage } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
type Step = 'email' | 'code' | 'password' | 'done';

const CODE_LENGTH = 6;

/** Six boxes over one hidden input, so paste and the SMS/email autofill work. */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable style={styles.codeRow} onPress={() => input.current?.focus()} accessibilityLabel="Verification code">
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const active = focused && (i === value.length || (i === CODE_LENGTH - 1 && value.length === CODE_LENGTH));
        return (
          <View key={i} style={[styles.codeBox, value[i] ? styles.codeBoxFilled : null, active && styles.codeBoxActive]}>
            <Text style={styles.codeDigit}>{value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

export function ForgotPasswordScreen() {
  const nav = useNavigation<Nav>();
  const { tx } = useLanguage();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.isNetworkError) {
        setError(tx('সার্ভারে সংযোগ করা যায়নি। আবার চেষ্টা করুন।', 'Could not reach the server. Try again.'));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const clean = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(tx('সঠিক ইমেইল ঠিকানা লিখুন।', 'Enter a valid email address.'));
      const reply = await authApi.requestRecovery(clean);
      setResendIn(reply.resend_after || 45);
      setCode(reply.dev_code ?? '');
      setInfo(
        reply.dev_code
          ? tx('ডেভেলপমেন্ট সার্ভার: কোডটি স্বয়ংক্রিয়ভাবে বসানো হয়েছে।', 'Development server: the code was filled in for you.')
          : null,
      );
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      if (code.length !== CODE_LENGTH) throw new Error(tx('৬ অঙ্কের কোডটি লিখুন।', 'Enter the 6-digit code.'));
      const reply = await authApi.verifyRecoveryCode(email, code);
      setToken(reply.token);
      setInfo(null);
      setStep('password');
    });

  const reset = () =>
    run(async () => {
      if (password.length < 6) throw new Error(tx('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।', 'Password must be at least 6 characters.'));
      if (password !== confirm) throw new Error(tx('দুটি পাসওয়ার্ড মেলেনি।', 'The passwords do not match.'));
      await authApi.resetPassword(token, password);
      setStep('done');
    });

  const content: Record<Step, { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string }> = {
    email: {
      icon: 'finger-print-outline',
      title: tx('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot your password?'),
      subtitle: tx('অ্যাকাউন্টের ইমেইল দিন, আমরা একটি যাচাই কোড পাঠাব।', 'Enter your account email and we will send you a verification code.'),
    },
    code: {
      icon: 'mail-outline',
      title: tx('ইমেইল যাচাই করুন', 'Verify your email'),
      subtitle: tx(`${email.trim()}-এ পাঠানো ৬ অঙ্কের কোডটি লিখুন`, `Enter the 6-digit code sent to ${email.trim()}`),
    },
    password: {
      icon: 'lock-open-outline',
      title: tx('নতুন পাসওয়ার্ড দিন', 'Set a new password'),
      subtitle: tx('এমন পাসওয়ার্ড বেছে নিন যা আগে ব্যবহার করেননি।', 'Choose a password you have not used before.'),
    },
    done: {
      icon: 'checkmark-circle-outline',
      title: tx('পাসওয়ার্ড বদলানো হয়েছে', 'Password changed'),
      subtitle: tx('নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।', 'Sign in with your new password.'),
    },
  };
  const { icon, title, subtitle } = content[step];

  const goBack = () => {
    setError(null);
    if (step === 'code') setStep('email');
    else if (step === 'password') setStep('code');
    else nav.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        {step !== 'done' ? (
          <Pressable onPress={goBack} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel={tx('ফিরে যান', 'Go back')}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.brand}>BornoVerse</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconBox}>
            <Ionicons name={icon} size={26} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.form}>
            {step === 'email' ? (
              <IconInput
                icon="mail-outline"
                placeholder={tx('আপনার ইমেইল', 'Enter your email')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
                returnKeyType="send"
                onSubmitEditing={sendCode}
              />
            ) : null}

            {step === 'code' ? <CodeInput value={code} onChange={setCode} /> : null}

            {step === 'password' ? (
              <>
                <IconInput
                  icon="lock-closed-outline"
                  placeholder={tx('নতুন পাসওয়ার্ড', 'New password')}
                  value={password}
                  onChangeText={setPassword}
                  secret
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoFocus
                />
                <IconInput
                  icon="lock-closed-outline"
                  placeholder={tx('পাসওয়ার্ড আবার লিখুন', 'Confirm your password')}
                  value={confirm}
                  onChangeText={setConfirm}
                  secret
                  autoCapitalize="none"
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={reset}
                />
              </>
            ) : null}

            {info ? (
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.tintBlueText} />
                <Text style={styles.infoText}>{info}</Text>
              </View>
            ) : null}
            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={18} color={Colors.tintErrorText} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {step === 'email' ? (
              <AppButton label={tx('কোড পাঠান', 'Send code')} onPress={sendCode} isLoading={busy} />
            ) : step === 'code' ? (
              <AppButton label={tx('যাচাই করুন', 'Continue')} onPress={verify} isLoading={busy} disabled={code.length !== CODE_LENGTH} />
            ) : step === 'password' ? (
              <>
                <AppButton label={tx('পাসওয়ার্ড বদলান', 'Continue')} onPress={reset} isLoading={busy} />
                <AppButton label={tx('বাতিল', 'Cancel')} variant="secondary" onPress={() => nav.navigate('Login')} />
              </>
            ) : (
              <AppButton label={tx('সাইন ইন', 'Sign in')} onPress={() => nav.navigate('Login')} />
            )}
          </View>

          {step === 'email' ? (
            <Pressable onPress={() => nav.navigate('Login')} hitSlop={8} style={styles.footer} accessibilityRole="link">
              <Text style={styles.footerText}>{tx('সাইন ইন পাতায় ফিরে যান', 'Back to sign in')}</Text>
            </Pressable>
          ) : null}

          {step === 'code' ? (
            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>{tx('কোড পাননি?', "Didn't receive a code?")}</Text>
              {resendIn > 0 ? (
                <Text style={styles.footerMuted}>{tx(`${resendIn} সেকেন্ড পর আবার পাঠান`, `Resend in ${resendIn}s`)}</Text>
              ) : (
                <Pressable onPress={sendCode} hitSlop={8} disabled={busy} accessibilityRole="button">
                  <Text style={styles.footerText}>{tx('আবার পাঠান', 'Resend code')}</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  back: {
    width: 32,
  },
  brand: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg + 4,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing.xl,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes['2xl'],
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    alignSelf: 'stretch',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  codeBox: {
    flex: 1,
    height: 54,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: {
    backgroundColor: Colors.surface,
  },
  codeBoxActive: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  codeDigit: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.tintBlue,
    borderRadius: Radius.sm + 2,
    padding: Spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.tintBlueText,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.tintError,
    borderRadius: Radius.sm + 2,
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.tintErrorText,
  },
  footer: {
    marginTop: Spacing.xl,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xl,
  },
  footerMuted: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  footerText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
});
