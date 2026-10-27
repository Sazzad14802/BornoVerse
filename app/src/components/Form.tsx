/**
 * Form primitives shared by create/edit/publisher forms:
 * a labelled text field, an icon input (sign-in forms), a segmented option
 * picker and a form card.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

interface IconInputProps extends TextInputProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Password field: hides the text and adds a show/hide toggle. */
  secret?: boolean;
}

/** Text input with a leading icon; the border turns brand green while focused. */
export function IconInput({ icon, secret, style, onFocus, onBlur, ...input }: IconInputProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={[styles.iconInput, focused && styles.iconInputFocused, style as ViewStyle]}>
      <Ionicons name={icon} size={20} color={focused ? Colors.primary : Colors.textMuted} />
      <TextInput
        {...input}
        style={styles.iconInputText}
        placeholderTextColor={Colors.textMuted}
        secureTextEntry={secret && !revealed}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
      {secret ? (
        <Pressable
          onPress={() => setRevealed((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
}

export function Field({ label, required, hint, error, style, multiline, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...input}
        multiline={multiline}
        style={[styles.input, multiline && styles.textArea, error ? styles.inputError : null, style]}
        placeholderTextColor={Colors.textMuted}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange, hint }: SegmentedProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pillRow}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              disabled={option.disabled}
              onPress={() => onChange(option.value)}
              style={[styles.pill, active && styles.pillActive, option.disabled && styles.pillDisabled]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !!option.disabled }}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FormCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  iconInput: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
  },
  iconInputFocused: {
    borderColor: Colors.primary,
  },
  iconInputText: {
    flex: 1,
    height: '100%',
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: Spacing.md,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  required: {
    color: Colors.primary,
  },
  input: {
    minHeight: 48,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  inputError: {
    borderColor: Colors.error,
  },
  textArea: {
    minHeight: 88,
    paddingTop: Spacing.sm,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  error: {
    fontSize: FontSizes.xs,
    color: Colors.tintErrorText,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs + 2,
  },
  pill: {
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillDisabled: {
    opacity: 0.4,
  },
  pillText: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
  },
});
