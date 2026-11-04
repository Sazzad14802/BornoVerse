/**
 * ErrorBoundary — if a screen fails while drawing, show a calm recovery screen
 * (with "Try again") instead of closing the app. The error is logged.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; english?: boolean }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const en = this.props.english;
    return (
      <View style={styles.wrap}>
        <View style={styles.icon}>
          <Ionicons name="refresh-circle-outline" size={34} color={Colors.primary} />
        </View>
        <Text style={styles.title}>{en ? 'Something went wrong' : 'কিছু একটা সমস্যা হয়েছে'}</Text>
        <Text style={styles.body}>
          {en
            ? 'This screen could not be shown. Check your connection and try again.'
            : 'এই পাতাটি দেখানো যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'}
        </Text>
        <AppButton label={en ? 'Try again' : 'আবার চেষ্টা করুন'} onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
