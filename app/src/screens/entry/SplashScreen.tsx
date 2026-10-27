/**
 * SplashScreen — full brand-green screen; the white logo fades and scales in,
 * then the app continues (about 1.3 s, or on tap once it knows where to go).
 * The native splash uses the same colour and logo, so there is no flash.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StatusBar, StyleSheet } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { Colors, FontSizes, Spacing } from '../../theme';

interface SplashScreenProps {
  onContinue: () => void;
  /** False until the app knows where to go next (first run vs. returning user). */
  ready?: boolean;
}

const INTRO_MS = 700;
const HOLD_MS = 600;

export function SplashScreen({ onContinue, ready = true }: SplashScreenProps) {
  const { t } = useLanguage();
  const logo = useRef(new Animated.Value(0)).current;
  const caption = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: INTRO_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(caption, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [logo, caption]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(onContinue, INTRO_MS + HOLD_MS);
    return () => clearTimeout(timer);
  }, [onContinue, ready]);

  const scale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <Pressable style={styles.container} onPress={ready ? onContinue : undefined} accessibilityLabel={t('appName')}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <Animated.Image
        source={require('../../../assets/logo-white.png')}
        style={[styles.logo, { opacity: logo, transform: [{ scale }] }]}
        resizeMode="contain"
      />
      <Animated.Text style={[styles.name, { opacity: caption }]}>{t('appName')}</Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: caption }]}>{t('appTagline')}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  logo: {
    width: 112,
    height: 112,
  },
  name: {
    marginTop: Spacing.lg,
    fontSize: FontSizes['2xl'],
    fontWeight: '700',
    color: Colors.textOnPrimary,
    letterSpacing: 0.3,
  },
  tagline: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    color: 'rgba(255, 255, 255, 0.78)',
  },
});
