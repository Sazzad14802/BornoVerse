/**
 * LoginScreen — sign in / create account with email and password, or Google
 * (via Supabase, verified by the Platform API).
 *
 * Layout: logo, heading, icon inputs, primary action, "or continue with"
 * divider, Google button, and a footer link that switches between the modes.
 * Sign-up asks for the password twice (with a live checklist of the rules),
 * needs the Terms & Privacy checkbox, then confirms the email with a code
 * (VerifyEmailScreen) before the account is created.
 */

import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { AuthStackParamList } from '../../navigation/types';
import { AppButton } from '../../components/AppButton';
import { IconInput } from '../../components/Form';
import { PasswordRules, passwordValid } from '../../components/PasswordRules';
import { authApi } from '../../api/auth';
import { Colors, FontSizes, Radius, Spacing } from '../../theme';
import { ApiError, errorMessage } from '../../api/client';
import { GoogleSignInCancelled, isGoogleSignInConfigured, signInWithGoogle } from '../../services/googleAuth';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

/** A readable, unique-enough username from the name or email (the API needs one). */
function usernameFor(name: string, email: string): string {
  const namePart = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const emailPart = email.split('@')[0].replace(/[^a-z0-9_]/g, '');
  const base = namePart.length >= 3 ? namePart : emailPart.length >= 3 ? emailPart : 'user';
  return `${base.slice(0, 40)}_${Math.floor(1000 + Math.random() * 9000)}`;
}

export function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { login, register, acceptSession } = useAuth();
  const { tx } = useLanguage();

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setConfirm('');
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError(tx('সঠিক ইমেইল ঠিকানা লিখুন।', 'Enter a valid email address.'));
      return;
    }
    // Passwords are used exactly as typed; spaces are valid characters.
    if (isSignUp) {
      if (name.trim().length < 2) {
        setError(tx('আপনার নাম লিখুন।', 'Enter your name.'));
        return;
      }
      if (!passwordValid(password, confirm)) {
        setError(tx('পাসওয়ার্ডের সব শর্ত পূরণ করুন।', 'Meet every password requirement.'));
        return;
      }
      if (!agreed) {
        setError(tx('চালিয়ে যেতে শর্তাবলি ও গোপনীয়তা নীতিতে সম্মতি দিন।', 'Agree to the Terms and Privacy Policy to continue.'));
        return;
      }
    } else if (!password) {
      setError(tx('পাসওয়ার্ড লিখুন।', 'Enter your password.'));
      return;
    }

    setBusy('form');
    try {
      if (isSignUp) {
        const signup = {
          username: usernameFor(name, cleanEmail),
          email: cleanEmail,
          password,
          full_name: name.trim() || undefined,
        };
        const started = await authApi.registerStart(cleanEmail, signup.username);
        if (started.verification_required) {
          nav.navigate('VerifyEmail', { signup, resendAfter: started.resend_after, devCode: started.dev_code });
        } else {
          await register(signup);
        }
      } else {
        await login({ username_or_email: cleanEmail, password });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(tx('এই ইমেইলে আগেই অ্যাকাউন্ট আছে। সাইন ইন করুন।', 'An account with this email already exists. Sign in instead.'));
      } else if (err instanceof ApiError && err.status === 503) {
        setError(tx('ইমেইল যাচাইয়ের সেবা এখনো চালু হয়নি। পরে চেষ্টা করুন।', 'Email verification is not set up on the server yet. Try again later.'));
      } else if (err instanceof ApiError && err.status === 401) {
        setError(tx('ইমেইল বা পাসওয়ার্ড সঠিক নয়।', 'Incorrect email or password.'));
      } else if (err instanceof ApiError && err.isNetworkError) {
        setError(
          tx(
            'সার্ভারে সংযোগ করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
            'Could not reach the server. Check your connection and try again.',
          ),
        );
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    if (!isGoogleSignInConfigured()) {
      setError(tx('Google সাইন-ইন এখনো চালু হয়নি।', 'Google sign-in is not available yet.'));
      return;
    }
    setBusy('google');
    try {
      await acceptSession(await signInWithGoogle());
    } catch (err) {
      if (!(err instanceof GoogleSignInCancelled)) setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>
              {isSignUp ? tx('অ্যাকাউন্ট তৈরি করুন', 'Create your account') : tx('আবার স্বাগতম', 'Welcome back')}
            </Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? tx('কয়েক সেকেন্ডেই শুরু করুন', 'Get started in a few seconds')
                : tx('আপনার অ্যাকাউন্টে সাইন ইন করুন', 'Sign in to your account')}
            </Text>
          </View>

          <View style={styles.form}>
            {isSignUp ? (
              <IconInput
                icon="person-outline"
                placeholder={tx('পূর্ণ নাম', 'Full name')}
                value={name}
                onChangeText={setName}
                autoComplete="name"
                textContentType="name"
              />
            ) : null}
            <IconInput
              icon="mail-outline"
              placeholder={tx('ইমেইল', 'Email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <IconInput
              icon="lock-closed-outline"
              placeholder={tx('পাসওয়ার্ড', 'Password')}
              value={password}
              onChangeText={setPassword}
              secret
              autoCapitalize="none"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              onSubmitEditing={isSignUp ? undefined : handleSubmit}
              returnKeyType={isSignUp ? 'next' : 'go'}
            />

            {isSignUp ? (
              <>
                <IconInput
                  icon="lock-closed-outline"
                  placeholder={tx('পাসওয়ার্ড নিশ্চিত করুন', 'Confirm password')}
                  value={confirm}
                  onChangeText={setConfirm}
                  secret
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <PasswordRules password={password} confirm={confirm} />
                <View style={styles.terms}>
                  <Pressable
                    onPress={() => setAgreed((v) => !v)}
                    hitSlop={8}
                    style={[styles.checkbox, agreed && styles.checkboxOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: agreed }}
                    accessibilityLabel={tx('শর্তাবলি ও গোপনীয়তা নীতিতে সম্মতি', 'Agree to the Terms and Privacy Policy')}
                  >
                    {agreed ? <Ionicons name="checkmark" size={16} color={Colors.textOnPrimary} /> : null}
                  </Pressable>
                  <Text style={styles.termsText}>
                    {tx('আমি ', 'I agree to the ')}
                    <Text style={styles.termsLink} onPress={() => nav.navigate('Terms')} accessibilityRole="link">
                      {tx('শর্তাবলি ও গোপনীয়তা নীতি', 'Terms and Privacy Policy')}
                    </Text>
                    {tx(' পড়েছি এবং সম্মত।', '.')}
                  </Text>
                </View>
              </>
            ) : null}

            {!isSignUp ? (
              <Pressable
                style={styles.forgot}
                onPress={() => nav.navigate('ForgotPassword')}
                hitSlop={8}
                accessibilityRole="link"
              >
                <Text style={styles.link}>{tx('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot password?')}</Text>
              </Pressable>
            ) : null}

            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={18} color={Colors.tintErrorText} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <AppButton
              label={isSignUp ? tx('অ্যাকাউন্ট তৈরি করুন', 'Create account') : tx('সাইন ইন', 'Sign in')}
              onPress={handleSubmit}
              isLoading={busy === 'form'}
              disabled={busy !== null}
            />
          </View>

          <View style={styles.divider}>
            <View style={styles.rule} />
            <Text style={styles.dividerText}>{tx('অথবা', 'or continue with')}</Text>
            <View style={styles.rule} />
          </View>

          <AppButton
            label={tx('Google দিয়ে চালিয়ে যান', 'Continue with Google')}
            onPress={handleGoogle}
            variant="google"
            isLoading={busy === 'google'}
            disabled={busy !== null}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isSignUp ? tx('আগেই অ্যাকাউন্ট আছে?', 'Already have an account?') : tx('অ্যাকাউন্ট নেই?', "Don't have an account?")}
            </Text>
            <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>{isSignUp ? tx('সাইন ইন', 'Sign in') : tx('সাইন আপ', 'Sign up')}</Text>
            </Pressable>
          </View>
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
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg + 4,
    paddingVertical: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes['2xl'],
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
  },
  form: {
    gap: Spacing.md,
  },
  terms: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.xs,
  },
  link: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.tintError,
    borderRadius: Radius.sm + 2,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 19,
    color: Colors.tintErrorText,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg + 4,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.surfaceBorder,
  },
  dividerText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
