/**
 * AppAlert — the app's own dialog, styled like the rest of BornoVerse, used
 * instead of the system Alert. Same call shape as React Native's Alert:
 *
 *   AppAlert.alert('Delete?', 'This cannot be undone.', [
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'Delete', style: 'destructive', onPress: remove },
 *   ]);
 *
 * Mount <AppAlertHost /> once at the root. Dialogs queue and show one at a time.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Radius, Spacing } from '../theme';

export interface AppAlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface Dialog {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
}

let nextId = 1;
let queue: Dialog[] = [];
const listeners = new Set<(dialog: Dialog | null) => void>();

function publish() {
  listeners.forEach((listener) => listener(queue[0] ?? null));
}

export const AppAlert = {
  alert(title: string, message?: string, buttons?: AppAlertButton[]) {
    queue = [...queue, { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] }];
    publish();
  },
};

function close(dialog: Dialog, button?: AppAlertButton) {
  queue = queue.filter((d) => d.id !== dialog.id);
  publish();
  button?.onPress?.();
}

/** Icon that matches the tone of the dialog. */
function toneOf(dialog: Dialog): { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; background: string } {
  if (dialog.buttons.some((b) => b.style === 'destructive')) {
    return { icon: 'alert-circle-outline', color: Colors.tintErrorText, background: Colors.tintError };
  }
  if (dialog.buttons.length > 1) {
    return { icon: 'help-circle-outline', color: Colors.primary, background: Colors.primarySurface };
  }
  return { icon: 'information-circle-outline', color: Colors.primary, background: Colors.primarySurface };
}

export function AppAlertHost() {
  const [dialog, setDialog] = useState<Dialog | null>(queue[0] ?? null);
  useEffect(() => {
    listeners.add(setDialog);
    return () => {
      listeners.delete(setDialog);
    };
  }, []);

  if (!dialog) return null;
  const tone = toneOf(dialog);
  const cancel = dialog.buttons.find((b) => b.style === 'cancel');
  const stacked = dialog.buttons.length > 2;
  // Cancel sits first (left) in a row and last at the bottom of a stack.
  const ordered = stacked
    ? [...dialog.buttons.filter((b) => b.style !== 'cancel'), ...(cancel ? [cancel] : [])]
    : [...(cancel ? [cancel] : []), ...dialog.buttons.filter((b) => b.style !== 'cancel')];

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => close(dialog, cancel)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel ? () => close(dialog, cancel) : undefined} />
        <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
          <View style={[styles.icon, { backgroundColor: tone.background }]}>
            <Ionicons name={tone.icon} size={24} color={tone.color} />
          </View>
          <Text style={styles.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {ordered.map((button) => {
              const kind = button.style === 'cancel' ? 'cancel' : button.style === 'destructive' ? 'danger' : 'primary';
              return (
                <Pressable
                  key={button.text}
                  onPress={() => close(dialog, button)}
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && styles.buttonInRow,
                    kind === 'primary' && styles.primary,
                    kind === 'danger' && styles.danger,
                    kind === 'cancel' && styles.cancel,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.buttonText, kind === 'cancel' ? styles.cancelText : styles.filledText]} numberOfLines={1}>
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  message: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  buttonsStacked: {
    flexDirection: 'column',
  },
  button: {
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  buttonInRow: {
    flex: 1,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  danger: {
    backgroundColor: Colors.error,
  },
  cancel: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  filledText: {
    color: Colors.textOnPrimary,
  },
  cancelText: {
    color: Colors.textPrimary,
  },
});
