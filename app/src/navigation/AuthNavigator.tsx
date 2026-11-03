/**
 * AuthNavigator — first-run setup (language → notification permission) followed
 * by sign-in. Returning users skip straight from the splash to sign-in.
 */

import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import { SplashScreen } from '../screens/entry/SplashScreen';
import { LanguageSelectScreen } from '../screens/entry/LanguageSelectScreen';
import { NotificationsPromptScreen } from '../screens/entry/NotificationsPromptScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { VerifyEmailScreen } from '../screens/auth/VerifyEmailScreen';
import { TermsScreen } from '../screens/auth/TermsScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { useNotifications } from '../contexts/NotificationsContext';
import { onboardingStorage } from '../storage/onboardingStorage';
import { Colors } from '../theme';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { requestPermission } = useNotifications();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    onboardingStorage.isDone().then(setOnboarded);
  }, []);

  const finishOnboarding = async (navigation: any) => {
    await onboardingStorage.markDone();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="Splash">
        {({ navigation }) => (
          <SplashScreen
            onContinue={() =>
              onboarded ? navigation.replace('Login') : navigation.replace('LanguageSelect')
            }
            ready={onboarded !== null}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="LanguageSelect">
        {({ navigation }) => (
          <LanguageSelectScreen
            onContinue={() => navigation.navigate('NotificationsPrompt')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="NotificationsPrompt">
        {({ navigation }) => (
          <NotificationsPromptScreen
            onBack={() => navigation.goBack()}
            onAllow={async () => {
              await requestPermission().catch(() => false);
              await finishOnboarding(navigation);
            }}
            onSkip={() => finishOnboarding(navigation)}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
    </Stack.Navigator>
  );
}
