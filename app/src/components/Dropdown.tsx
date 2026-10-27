/**
 * Dropdown — a compact filter button ("Genre ▾") that opens a bottom sheet
 * with a single-choice option list. An option with value '' means "any"; the
 * button turns brand green while a non-default value is selected.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalBottomSheet, SheetScrollView } from './ModalBottomSheet';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  /** Shown on the button while the default (first) option is selected, and as the sheet title. */
  label: string;
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Dropdown<T extends string>({ label, options, value, onChange }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const active = value !== options[0]?.value;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, active && styles.buttonActive, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
      >
        <Text style={[styles.buttonText, active && styles.buttonTextActive]} numberOfLines={1}>
          {active ? selected?.label : label}
        </Text>
        <Ionicons name="chevron-down" size={14} color={active ? Colors.textOnPrimary : Colors.textSecondary} />
      </Pressable>

      <ModalBottomSheet visible={open} onClose={() => setOpen(false)}>
        <Text style={styles.sheetTitle}>{label}</Text>
        <SheetScrollView maxHeight={420}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value || 'any'}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.label}</Text>
                {isSelected ? <Ionicons name="checkmark" size={20} color={Colors.primary} /> : <View style={styles.tick} />}
              </Pressable>
            );
          })}
        </SheetScrollView>
      </ModalBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  buttonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
  buttonText: {
    maxWidth: 140,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  buttonTextActive: {
    color: Colors.textOnPrimary,
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  option: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  optionText: {
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: Colors.primary,
  },
  tick: {
    width: 20,
  },
});
