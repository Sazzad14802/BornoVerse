/**
 * VerifyEmailScreen — second step of sign-up: enter the 6-digit code emailed to
 * the new address (with a resend countdown). A correct code creates the account
 * and signs in; the new listener then picks favourites.
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { AppButton } from '../../components/AppButton';
import { CodeInput } from './ForgotPasswordScreen';
import { authApi } from '../../api/auth';
import { ApiError, errorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

export function VerifyEmailScreen({ navigation, route }: Props) {
  const { signup } = route.params;
  const { register } = useAuth();
  const { tx } = useLanguage();
  const [code, setCode] = useState(route.params.devCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(route.params.resendAfter ?? 45);
  const [info, setInfo] = useState<string | null>(
    route.params.devCode ? tx('ডেভেলপমেন্ট সার্ভার: কোডটি বসানো হয়েছে।', 'Development server: the code was filled in.') : null,
  );

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await register({ ...signup, email_code: code });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(tx('এই ইমেইল বা ইউজারনেমে আগেই অ্যাকাউন্ট আছে।', 'An account with this email or username already exists.'));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      const reply = await authApi.registerStart(signup.email, signup.username);
      setResendIn(reply.resend_after ?? 45);
      setCode(reply.dev_code ?? '');
      setInfo(tx('নতুন কোড পাঠানো হয়েছে।', 'A new code was sent.'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={tx('ফিরে যান', 'Go back')}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.brand}>BornoVerse</Text>
        <View style={styles.back} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconBox}>
            <Ionicons name="mail-unread-outline" size={26} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{tx('ইমেইল যাচাই করুন', 'Verify your email')}</Text>
          <Text style={styles.subtitle}>
            {tx(`${signup.email}-এ পাঠানো ৬ অঙ্কের কোডটি লিখুন`, `Enter the 6-digit code we sent to ${signup.email}`)}
          </Text>

          <View style={styles.form}>
            <CodeInput value={code} onChange={setCode} />
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
            <AppButton
              label={tx('যাচাই করে অ্যাকাউন্ট খুলুন', 'Verify and create account')}
              onPress={verify}
              isLoading={busy}
              disabled={code.length !== 6}
            />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.muted}>{tx('কোড পাননি? স্প্যাম ফোল্ডারও দেখুন।', "Didn't get it? Check spam too.")}</Text>
            {resendIn > 0 ? (
              <Text style={styles.muted}>{tx(`${resendIn} সেকেন্ড পরে আবার পাঠান`, `Resend in ${resendIn}s`)}</Text>
            ) : (
              <Pressable onPress={resend} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>{tx('আবার পাঠান', 'Resend code')}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  brand: { flex: 1, textAlign: 'center', fontSize: FontSizes.md, fontWeight: '700', color: Colors.textPrimary },
  content: { flexGrow: 1, paddingHorizontal: Spacing.lg + 4, paddingTop: Spacing.lg, paddingBottom: Spacing.xl },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSizes['2xl'], fontWeight: '700', color: Colors.textPrimary },
  subtitle: { marginTop: 6, fontSize: FontSizes.base, color: Colors.textSecondary, lineHeight: 22 },
  form: { gap: Spacing.md, marginTop: Spacing.xl },
  infoBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.tintBlue,
    borderRadius: Radius.sm + 2,
    padding: Spacing.sm + 2,
  },
  infoText: { flex: 1, fontSize: FontSizes.sm, color: Colors.tintBlueText },
  errorBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.tintError,
    borderRadius: Radius.sm + 2,
    padding: Spacing.sm + 2,
  },
  errorText: { flex: 1, fontSize: FontSizes.sm, color: Colors.tintErrorText, lineHeight: 19 },
  footerRow: { alignItems: 'center', gap: 6, marginTop: Spacing.xl },
  muted: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  link: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.primary },
});
