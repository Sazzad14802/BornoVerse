/**
 * ProgressRing — circular progress with the percentage in the centre.
 * The arc animates smoothly between values; `indeterminate` spins a short arc
 * while the amount of work is not known yet.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, FontSizes } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0-1 */
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  indeterminate?: boolean;
  /** Small text under the percentage, e.g. "3 / 12 pages". */
  caption?: string;
}

export function ProgressRing({
  progress,
  size = 168,
  stroke = 12,
  color = Colors.primary,
  indeterminate = false,
  caption,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress));
    Animated.timing(value, { toValue: target, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, value]);

  useEffect(() => {
    const id = value.addListener(({ value: v }) => setShown(Math.round(v * 100)));
    return () => value.removeListener(id);
  }, [value]);

  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [indeterminate, spin]);

  const offset = value.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: shown }}>
      <Animated.View style={[StyleSheet.absoluteFill, indeterminate && { transform: [{ rotate }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={Colors.track} strokeWidth={stroke} fill="none" />
          {indeterminate ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.25} ${circumference}`}
            />
          ) : (
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={offset}
              // Start the arc at 12 o'clock.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </Svg>
      </Animated.View>
      <View style={styles.centre}>
        {indeterminate ? null : <Text style={[styles.percent, { fontSize: size * 0.2 }]}>{shown}%</Text>}
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  caption: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
});
