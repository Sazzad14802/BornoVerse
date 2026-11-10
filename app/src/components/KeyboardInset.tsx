/**
 * Keeps typed text visible above the on-screen keyboard.
 *
 * Android draws the app edge to edge, so the system no longer shrinks the
 * window when the keyboard opens. We do it instead:
 * - <KeyboardHeightProvider> tracks the keyboard's height (`useKeyboardHeight()`).
 * - <KeyboardInset> gives the screens bottom padding equal to that height, so
 *   scroll views end above the keyboard and Android scrolls the focused field
 *   into view.
 * Bottom sheets are drawn outside <KeyboardInset> (absolutely positioned views
 * ignore a parent's padding) and lift themselves by the same height.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

const KeyboardHeight = createContext(0);

export function useKeyboardHeight(): number {
  return useContext(KeyboardHeight);
}

export function KeyboardHeightProvider({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return <KeyboardHeight.Provider value={height}>{children}</KeyboardHeight.Provider>;
}

export function KeyboardInset({ children }: { children: React.ReactNode }) {
  const height = useKeyboardHeight();
  return <View style={[styles.fill, { paddingBottom: height }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
