/**
 * Root component: composes the app-wide providers (language → session →
 * notifications → audio player) and mounts the navigator.
 */

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { PlayerProvider } from './src/contexts/PlayerContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { SheetHost } from './src/components/ModalBottomSheet';
import { AppAlertHost } from './src/components/AppAlert';
import { KeyboardInset } from './src/components/KeyboardInset';

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <NotificationsProvider>
            <PlayerProvider>
              {/* Bottom sheets are drawn here, above every screen and the tab bar. */}
              {/* Lifts screens and sheets above the keyboard (Android is edge to edge). */}
              <KeyboardInset>
                <SheetHost>
                  <AppNavigator />
                </SheetHost>
              </KeyboardInset>
              <AppAlertHost />
              <StatusBar style="dark" />
            </PlayerProvider>
          </NotificationsProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
