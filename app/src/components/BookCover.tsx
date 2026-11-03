/**
 * BookCover — shows the uploaded cover, or a typographic cover generated from the
 * title when none exists: one solid colour with the title's first letter. The palette is derived from the title so a book always
 * gets the same artwork, without inventing stock imagery.
 */

import React, { useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { resolveMediaUrl } from '../config';
import { Radius } from '../theme';

const PALETTES = [
  ['#0C7F5F', '#E6F7F0'],
  ['#1B658A', '#E4F1F8'],
  ['#18794E', '#E2F5EA'],
  ['#6937A1', '#F2ECFA'],
  ['#8C5E14', '#FBF1DC'],
  ['#0F2A22', '#EDF5F1'],
] as const;

function paletteFor(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

interface BookCoverProps {
  title: string;
  uri?: string | null;
  size?: number;
  width?: number;
  height?: number;
  radius?: number;
  /** Stretch to the parent's size instead of a fixed square. */
  fill?: boolean;
  style?: ViewStyle;
}

export function BookCover({ title, uri, size = 58, width, height, radius = Radius.md, fill, style }: BookCoverProps) {
  const [failed, setFailed] = useState(false);
  // A filling cover sizes its initial from the measured box.
  const [measured, setMeasured] = useState(0);
  const w = width ?? size;
  const h = height ?? size;
  const source = resolveMediaUrl(uri);
  const frame = fill
    ? { width: '100%' as const, height: '100%' as const, borderRadius: radius }
    : { width: w, height: h, borderRadius: radius };

  if (source && !failed) {
    return (
      <Image
        source={{ uri: source }}
        style={[frame, styles.image, style as any]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const [ink, paper] = paletteFor(title || '?');
  const initial = Array.from((title || '?').trim())[0] ?? '?';
  const side = fill ? measured || w : Math.min(w, h);
  return (
    <View
      style={[frame, styles.generated, { backgroundColor: paper }, style]}
      onLayout={
        fill
          ? (e: LayoutChangeEvent) => setMeasured(Math.min(e.nativeEvent.layout.width, e.nativeEvent.layout.height))
          : undefined
      }
    >
      <Text style={[styles.initial, { color: ink, fontSize: Math.round(side * 0.42) }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#EDF5F1',
  },
  generated: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontWeight: '800',
  },
});
