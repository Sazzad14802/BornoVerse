/**
 * App-wide configuration.
 *
 * API base URL resolution (Chain of Responsibility):
 * 1. EXPO_PUBLIC_API_URL, when set, is the only candidate (APK / tunnel builds).
 * 2. The LAN host Expo Go was loaded from, so a phone reaches the dev machine.
 * 3. The emulator / simulator loopback address.
 * The HTTP client remembers whichever candidate answered last.
 */

import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

export const LAN_DEFAULT_IP = '192.168.0.156';

function isIpAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function getDetectedLanHost(): string {
  const hostUri =
    Constants.expoConfig?.hostUri || (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const rawHost = hostUri.split(':')[0];
    if (rawHost && isIpAddress(rawHost) && rawHost !== '127.0.0.1') {
      return rawHost;
    }
  }
  const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL as string | undefined;
  if (scriptURL) {
    const match = scriptURL.match(/^(?:https?|exps?):\/\/([^:/]+)/);
    if (match && match[1] && isIpAddress(match[1]) && match[1] !== '127.0.0.1') {
      return match[1];
    }
  }
  return LAN_DEFAULT_IP;
}

export function getApiBaseUrlCandidates(): string[] {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return [configured.replace(/\/+$/, '')];
  const lanHost = getDetectedLanHost();
  return [
    `http://${lanHost}:8000`,
    Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000',
  ];
}

let currentApiBaseUrl = getApiBaseUrlCandidates()[0];

export function getActiveApiBaseUrl(): string {
  return currentApiBaseUrl;
}

export function setActiveApiBaseUrl(url: string) {
  currentApiBaseUrl = url;
}

/**
 * Turns a server-relative path (covers, signed media grants) into an absolute URL.
 * Absolute http(s) and local file URIs are returned unchanged.
 */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|file:|content:|data:)/.test(url)) return url;
  return `${currentApiBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Fail-fast timeout for JSON requests. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Timeout for multipart uploads (PDF, MP3, covers). */
export const UPLOAD_TIMEOUT_MS = 180_000;

/** Playback progress sync / listening heartbeat interval. */
export const PLAYBACK_SYNC_INTERVAL_MS = 10_000;

/** Rewind / fast-forward step, in the app and on the lock screen notification. */
export const SEEK_STEP_SECONDS = 10;

/** Generation status polling interval. */
export const GENERATION_POLL_INTERVAL_MS = 4_000;

/** Media grants are valid for 15 minutes; refresh a little before they expire. */
export const MEDIA_GRANT_REFRESH_MS = 12 * 60_000;
