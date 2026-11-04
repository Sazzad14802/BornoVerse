/**
 * Root AppNavigator: auth flow while signed out, the tab app once signed in.
 * A new listener first picks favourites (FavouritesScreen) before the tabs.
 * Deep links (`bornoverse://…`, Expo Go `exp://…/--/…`) are handled by the
 * payment flow through expo-web-browser, so no linking config is needed here.
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { Loading } from '../components/Loading';
import { FavouritesScreen } from '../screens/entry/FavouritesScreen';
import { socialApi } from '../api/social';
import { profileApi } from '../api/account';
import { useLanguage } from '../contexts/LanguageContext';
import { navigationRef } from './navigationRef';
import { ErrorBoundary } from '../components/ErrorBoundary';

type Gate = 'checking' | 'required' | 'done';

/** Whether the signed-in listener still has to pick favourites. */
function useFavouritesGate(userId: string | undefined, isMember: boolean, isNewAccount: boolean): [Gate, () => void] {
  const [gate, setGate] = useState<Gate>('checking');
  useEffect(() => {
    if (!userId || !isMember) {
      setGate('done');
      return;
    }
    // An account just created on this device always picks favourites first.
    if (isNewAccount) {
      setGate('required');
      return;
    }
    let active = true;
    setGate('checking');
    const ask = (retry: boolean): Promise<void> =>
      socialApi
        .favourites()
        .then((f) => {
          if (active) setGate(f.required ? 'required' : 'done');
        })
        .catch(() => {
          // A sleeping server (cold start) gets one more try; never block the app on this.
          if (retry && active) return new Promise<void>((r) => setTimeout(r, 2500)).then(() => ask(false));
          if (active) setGate('done');
        });
    ask(true);
    return () => {
      active = false;
    };
  }, [userId, isMember, isNewAccount]);
  return [gate, () => setGate('done')];
}

/** Keep the server's copy of the app language current (pushes use it). */
function useLanguageSync() {
  const { isAuthenticated, user, setUser } = useAuth();
  const { language } = useLanguage();
  useEffect(() => {
    if (!isAuthenticated || !user || user.account_type !== 'user' || user.language === language) return;
    profileApi.setLanguage(language).then(setUser).catch(() => {});
  }, [isAuthenticated, user?.id, user?.language, language]);
}

export function AppNavigator() {
  useLanguageSync();
  const { language } = useLanguage();
  const { isLoading, isAuthenticated, user, isNewAccount, finishOnboarding } = useAuth();
  const [gate, close] = useFavouritesGate(isAuthenticated ? user?.id : undefined, user?.account_type === 'user', isNewAccount);
  const finish = () => {
    finishOnboarding();
    close();
  };

  if (isLoading || (isAuthenticated && gate === 'checking')) {
    return <Loading fullScreen message="" />;
  }
  if (isAuthenticated && gate === 'required') {
    return <FavouritesScreen onDone={finish} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <ErrorBoundary english={language === 'en'}>{isAuthenticated ? <MainNavigator /> : <AuthNavigator />}</ErrorBoundary>
    </NavigationContainer>
  );
}
