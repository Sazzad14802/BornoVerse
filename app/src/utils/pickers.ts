/**
 * File pickers adapted to the upload layer's `PickedFile` shape, with client-side
 * size checks so users get immediate feedback (the server validates again).
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { PickedFile } from '../api/upload';

export const MAX_DOCUMENT_MB = 50;
export const MAX_COVER_MB = 5;

export class PickError extends Error {}

function fromDocument(asset: DocumentPicker.DocumentPickerAsset, maxMb: number): PickedFile {
  if (asset.size && asset.size > maxMb * 1024 * 1024) {
    throw new PickError(`File is larger than ${maxMb} MB`);
  }
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, file: (asset as any).file };
}

export async function pickDocument(kind: 'pdf' | 'mp3' | 'any' = 'pdf'): Promise<PickedFile | null> {
  const type = kind === 'pdf' ? ['application/pdf'] : kind === 'mp3' ? ['audio/mpeg', 'audio/mp3'] : ['application/pdf', 'audio/mpeg', 'audio/mp3'];
  const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  return fromDocument(result.assets[0], MAX_DOCUMENT_MB);
}

/** Supporting evidence for a report or an appeal: a PDF or an image (max 10 MB). */
export async function pickEvidence(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  return fromDocument(result.assets[0], 10);
}

/** One or more MP3 files, in the order the user picked them. */
export async function pickAudioFiles(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['audio/mpeg', 'audio/mp3'], copyToCacheDirectory: true, multiple: true });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((asset) => fromDocument(asset, MAX_DOCUMENT_MB));
}

export function isMp3(file: PickedFile): boolean {
  return file.name.toLowerCase().endsWith('.mp3') || file.mimeType === 'audio/mpeg';
}

/** Square picture for a profile or a channel logo (asks for gallery access). */
export async function pickProfileImage(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PermissionDenied(permission.canAskAgain);
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_COVER_MB * 1024 * 1024) {
    throw new PickError(`Picture is larger than ${MAX_COVER_MB} MB`);
  }
  return {
    uri: asset.uri,
    name: asset.fileName ?? `picture.${asset.mimeType === 'image/png' ? 'png' : 'jpg'}`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    file: (asset as any).file,
  };
}

/** Gallery access was refused; `canAskAgain` false means only Settings can grant it. */
export class PermissionDenied extends Error {
  constructor(public canAskAgain: boolean) {
    super('Gallery permission denied');
  }
}

/** Square-cropped cover image from the gallery. */
export async function pickCoverImage(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PickError('Photo library permission is required to choose a cover');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_COVER_MB * 1024 * 1024) {
    throw new PickError(`Cover is larger than ${MAX_COVER_MB} MB`);
  }
  return {
    uri: asset.uri,
    name: asset.fileName ?? `cover.${asset.mimeType === 'image/png' ? 'png' : 'jpg'}`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    file: (asset as any).file,
  };
}
