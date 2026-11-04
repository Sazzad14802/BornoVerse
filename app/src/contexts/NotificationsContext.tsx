/**
 * Notifications context.
 *
 * Delivery strategies (Strategy pattern, chosen at runtime):
 * - RemotePush: development/production builds register an Expo push token with the
 *   API, so the server can notify the device even when the app is closed.
 * - LocalMirror: Expo Go on Android cannot receive remote pushes (SDK 53+). There
 *   the app polls the inbox while running and mirrors new items as local
 *   notifications, so the experience still works during development.
 *
 * Also exposes the unread badge count and routes notification taps to screens.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { notificationsApi } from '../api/notifications';
import { openNotificationTarget } from '../navigation/navigationRef';
import { useAuth } from './AuthContext';

const POLL_INTERVAL_MS = 30_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PermissionState = 'undetermined' | 'granted' | 'denied';

interface NotificationsContextValue {
  permission: PermissionState;
  /** True when this build can receive server push while the app is closed. */
  remotePushSupported: boolean;
  unreadCount: number;
  requestPermission: () => Promise<boolean>;
  refreshUnread: () => Promise<void>;
  setUnreadCount: (count: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const remotePushSupported = Device.isDevice && Platform.OS !== 'web' && !(isExpoGo && Platform.OS === 'android');

/** Android channels the server targets by kind; each can be muted separately in system settings. */
const ANDROID_CHANNELS: { id: string; name: string; description: string }[] = [
  { id: 'audiobooks', name: 'Audiobooks', description: 'New audiobooks from channels you follow, and finished generations' },
  { id: 'account', name: 'Account & payments', description: 'Payments, Premium, publisher account and withdrawals' },
  { id: 'moderation', name: 'Moderation', description: 'Notices about your content and appeal decisions' },
  { id: 'default', name: 'General', description: 'Other BornoVerse updates' },
];

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  for (const channel of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      description: channel.description,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      lightColor: '#0C7F5F',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  }
}

function toState(status: Notifications.PermissionStatus): PermissionState {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [unreadCount, setUnreadCount] = useState(0);
  const mirroredIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    ensureAndroidChannel().catch(() => {});
    Notifications.getPermissionsAsync()
      .then((result) => setPermission(toState(result.status)))
      .catch(() => {});
  }, []);

  const requestPermission = useCallback(async () => {
    await ensureAndroidChannel().catch(() => {});
    const current = await Notifications.getPermissionsAsync();
    if (current.status === Notifications.PermissionStatus.GRANTED) {
      setPermission('granted');
      return true;
    }
    if (!current.canAskAgain) {
      setPermission('denied');
      return false;
    }
    const result = await Notifications.requestPermissionsAsync();
    setPermission(toState(result.status));
    return result.status === Notifications.PermissionStatus.GRANTED;
  }, []);

  // Register this device for remote push once signed in with permission.
  useEffect(() => {
    if (!isAuthenticated || permission !== 'granted' || !remotePushSupported) return;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any)?.easConfig?.projectId;
    Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
      .then(({ data }) => notificationsApi.registerPushToken(data, Platform.OS as 'android' | 'ios'))
      .catch((error) => console.warn('Push registration unavailable:', error?.message ?? error));
  }, [isAuthenticated, permission, user?.id]);

  /** Fetch the unread count; in LocalMirror mode also surface new items locally. */
  const refreshUnread = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const count = await notificationsApi.unreadCount();
      setUnreadCount(count);
      if (remotePushSupported || permission !== 'granted') return;

      const latest = await notificationsApi.list(1, 10);
      const unread = latest.filter((n) => !n.read_at);
      if (mirroredIds.current === null) {
        // First poll: remember what already exists instead of replaying history.
        mirroredIds.current = new Set(unread.map((n) => n.id));
        return;
      }
      for (const item of unread.reverse()) {
        if (mirroredIds.current.has(item.id)) continue;
        mirroredIds.current.add(item.id);
        await Notifications.scheduleNotificationAsync({
          content: { title: item.title, body: item.body, data: { ...item.data, kind: item.kind } },
          trigger: null,
        });
      }
    } catch {
      // Offline or signed out mid-request: keep the previous badge.
    }
  }, [isAuthenticated, permission]);

  // Poll while the app is in the foreground; refresh immediately on resume.
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      mirroredIds.current = null;
      return;
    }
    refreshUnread();
    const timer = setInterval(refreshUnread, POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [isAuthenticated, refreshUnread]);

  // Open the relevant screen when a notification is tapped (warm or cold start).
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.notification_id) notificationsApi.markRead(String(data.notification_id)).catch(() => {});
      // Give the navigator a moment to mount after a cold start.
      setTimeout(() => openNotificationTarget(data), 400);
      refreshUnread();
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener(() => refreshUnread());
    return () => {
      subscription.remove();
      received.remove();
    };
  }, [refreshUnread]);

  const value = useMemo(
    () => ({
      permission,
      remotePushSupported,
      unreadCount,
      requestPermission,
      refreshUnread,
      setUnreadCount,
    }),
    [permission, unreadCount, requestPermission, refreshUnread],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return value;
}
