/**
 * Form primitives shared by create/edit/publisher forms:
 * a labelled text field, an icon input (sign-in forms), a segmented option
 * picker and a form card.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalBottomSheet, SheetScrollView } from './ModalBottomSheet';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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

export function Field({ label, required, hint, error, style, multiline, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...input}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.textArea,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
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

interface Choice<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  description?: string;
}

/** Side-by-side selectable cards (single choice), e.g. narration language. */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.cardRow}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && styles.choicePressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              {option.icon ? <Ionicons name={option.icon} size={22} color={active ? Colors.primary : Colors.textSecondary} /> : null}
              <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{option.label}</Text>
              {option.description ? <Text style={styles.choiceDescription}>{option.description}</Text> : null}
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <Ionicons name="checkmark" size={12} color={Colors.textOnPrimary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A field that opens a bottom-sheet list (single choice), e.g. genre. */
export function SelectField<T extends string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  placeholder: string;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, styles.select, (open || pressed) && styles.inputFocused]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
      >
        {selected?.icon ? <Ionicons name={selected.icon} size={18} color={Colors.primary} /> : null}
        <Text style={[styles.selectText, !selected && styles.selectPlaceholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <ModalBottomSheet visible={open} onClose={() => setOpen(false)}>
        <Text style={styles.sheetTitle}>{label}</Text>
        <SheetScrollView maxHeight={440}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value || 'none'}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                  <Ionicons
                    name={option.icon ?? 'remove-outline'}
                    size={18}
                    color={active ? Colors.primary : Colors.textSecondary}
                  />
                </View>
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                {active ? <Ionicons name="checkmark" size={20} color={Colors.primary} /> : null}
              </Pressable>
            );
          })}
        </SheetScrollView>
      </ModalBottomSheet>
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
  inputFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  inputError: {
    borderColor: Colors.error,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  selectText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  selectPlaceholder: {
    color: Colors.textMuted,
  },
  cardRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  choice: {
    flex: 1,
    minHeight: 84,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    gap: 4,
  },
  choiceActive: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.primarySurface,
  },
  choicePressed: {
    opacity: 0.8,
  },
  choiceLabel: {
    fontSize: FontSizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  choiceLabelActive: {
    color: Colors.primaryDark,
  },
  choiceDescription: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  radio: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm + 1,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: Colors.primarySurface,
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  optionTextActive: {
    fontWeight: '700',
    color: Colors.primary,
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
