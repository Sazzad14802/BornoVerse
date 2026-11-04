/**
 * Avatar — a round picture for a person or a channel: the uploaded image when
 * there is one, otherwise the initials on the brand colour. An optional camera
 * badge marks it as editable.
 */

import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../config';
import { Colors } from '../theme';

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => Array.from(w)[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  );
}

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  /** Show a small camera badge (the picture can be changed). */
  editable?: boolean;
  ring?: boolean;
}

export function Avatar({ name, uri, size = 44, editable, ring }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const source = resolveMediaUrl(uri);
  const frame = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[frame, ring && styles.ring]}>
      {source && !failed ? (
        <Image source={{ uri: source }} style={[frame, styles.image]} onError={() => setFailed(true)} />
      ) : (
        <View style={[frame, styles.fallback]}>
          <Text style={[styles.initials, { fontSize: Math.round(size * 0.38) }]}>{initialsOf(name)}</Text>
        </View>
      )}
      {editable ? (
        <View style={[styles.badge, { right: -2, bottom: -2 }]}>
          <Ionicons name="camera" size={Math.max(12, Math.round(size * 0.2))} color={Colors.textOnPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: Colors.surfaceElevated,
  },
  fallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
    color: Colors.textOnPrimary,
  },
  ring: {
    borderWidth: 3,
    borderColor: Colors.brandLight,
  },
  badge: {
    position: 'absolute',
    padding: 5,
    borderRadius: 999,
    backgroundColor: Colors.surfaceDark,
    borderWidth: 2,
    borderColor: Colors.background,
  },
});
