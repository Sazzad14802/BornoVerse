/**
 * KeyboardInset — keeps typed text visible above the on-screen keyboard.
 *
 * Android draws the app edge to edge, so the system no longer shrinks the
 * window when the keyboard opens. This wrapper does it instead: while the
 * keyboard is up, the whole app (screens and bottom sheets) gets bottom
 * padding equal to the keyboard's height. Scroll views then end above the
 * keyboard and Android scrolls the focused field into view, and everything
 * else on the screen can still be reached by scrolling.
 *
 * `useKeyboardHeight()` lets parts of the UI react (the tab bar hides).
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

const KeyboardHeight = createContext(0);

export function useKeyboardHeight(): number {
  return useContext(KeyboardHeight);
}

export function KeyboardInset({ children }: { children: React.ReactNode }) {
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

  return (
    <KeyboardHeight.Provider value={height}>
      <View style={[styles.fill, { paddingBottom: height }]}>{children}</View>
    </KeyboardHeight.Provider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
