/**
 * Root navigation ref for navigating from outside React screens
 * (notification taps, payment deep links).
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import { MainTabParamList } from './types';

export const navigationRef = createNavigationContainerRef<MainTabParamList>();

/** Route a notification payload to the screen it refers to. */
export function openNotificationTarget(data: Record<string, unknown> | undefined) {
  if (!data || !navigationRef.isReady()) return;
  const kind = String(data.kind ?? '');
  const audiobookId = data.audiobook_id ? String(data.audiobook_id) : undefined;

  if (kind === 'channel.new_audiobook' && audiobookId) {
    navigationRef.navigate('HomeTab', { screen: 'Player', params: { audiobookId } } as any);
  } else if (kind.startsWith('generation.') && audiobookId) {
    navigationRef.navigate('LibraryTab', {
      screen: kind === 'generation.completed' ? 'Player' : 'GenerationStatus',
      params: { audiobookId },
    } as any);
  } else if (kind.startsWith('payment.')) {
    navigationRef.navigate('ProfileTab', { screen: 'Profile' } as any);
  } else if (kind.startsWith('publisher.') || kind.startsWith('withdrawal.')) {
    navigationRef.navigate('ProfileTab', { screen: 'Publisher' } as any);
  } else if (kind.startsWith('moderation.appeal')) {
    navigationRef.navigate('ProfileTab', { screen: 'Appeals' } as any);
  } else if (kind.startsWith('moderation.')) {
    // The warning and the Appeal button live in the Publisher studio.
    navigationRef.navigate('ProfileTab', { screen: 'Publisher' } as any);
  } else {
    navigationRef.navigate('HomeTab', { screen: 'Notifications' } as any);
  }
}
