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
import { navigationRef } from './navigationRef';

type Gate = 'checking' | 'required' | 'done';

/** Whether the signed-in listener still has to pick favourites. */
function useFavouritesGate(userId: string | undefined, isMember: boolean): [Gate, () => void] {
  const [gate, setGate] = useState<Gate>('checking');
  useEffect(() => {
    if (!userId || !isMember) {
      setGate('done');
      return;
    }
    let active = true;
    setGate('checking');
    socialApi
      .favourites()
      .then((f) => active && setGate(f.required ? 'required' : 'done'))
      // Offline or an older server: never block the app on this.
      .catch(() => active && setGate('done'));
    return () => {
      active = false;
    };
  }, [userId, isMember]);
  return [gate, () => setGate('done')];
}

export function AppNavigator() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const [gate, finish] = useFavouritesGate(isAuthenticated ? user?.id : undefined, user?.account_type === 'user');

  if (isLoading || (isAuthenticated && gate === 'checking')) {
    return <Loading fullScreen message="" />;
  }
  if (isAuthenticated && gate === 'required') {
    return <FavouritesScreen onDone={finish} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
