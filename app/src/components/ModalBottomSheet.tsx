/**
 * ModalBottomSheet — reusable sheet that slides up from below.
 *
 * Sheets are drawn by <SheetHost> at the app root (above every screen and the tab
 * bar) instead of a React Native <Modal>: a Modal is a separate Android window in
 * which drags never moved the sheet, while views in the app window follow the
 * finger fine (like the mini player).
 *
 * The sheet owns vertical drags, so it always follows the finger:
 * - dragging down moves the sheet; release far enough (or flick) to close it,
 *   otherwise it springs back;
 * - long content goes in <SheetScrollView>, which the same gesture scrolls: drag up
 *   scrolls the list, and once the list is back at the top, dragging down moves the sheet.
 * Taps inside work as usual; it also closes on the backdrop or the Android Back button.
 */

import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from './KeyboardInset';
import { Colors, Radius, Spacing } from '../theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Drag distance (pt) or downward fling speed (pt/ms) that closes the sheet. */
const CLOSE_DISTANCE = 80;
const CLOSE_VELOCITY = 0.8;
/** Starting/ending offset for the open and close slides (taller than any sheet). */
const OFFSCREEN = 900;

/** Runs `step(t)` with t easing from 0 to 1 over `duration` ms; returns a cancel function. */
function tween(duration: number, step: (t: number) => void, done?: () => void): () => void {
  const start = Date.now();
  let frame = 0;
  const tick = () => {
    const linear = Math.min(1, (Date.now() - start) / duration);
    step(1 - Math.pow(1 - linear, 3)); // ease-out cubic
    if (linear < 1) frame = requestAnimationFrame(tick);
    else done?.();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

// ── Host ──────────────────────────────────────────────────────────────────────

interface SheetHostApi {
  set: (id: string, props: SheetProps) => void;
  remove: (id: string) => void;
}

const SheetHostContext = createContext<SheetHostApi | null>(null);

/** Mount once near the app root, around the navigator; draws all open sheets on top. */
export function SheetHost({ children }: { children: React.ReactNode }) {
  const [sheets, setSheets] = useState<Record<string, SheetProps>>({});
  const api = useMemo<SheetHostApi>(
    () => ({
      set: (id, props) => setSheets((current) => ({ ...current, [id]: props })),
      remove: (id) =>
        setSheets((current) => {
          const { [id]: _removed, ...rest } = current;
          return rest;
        }),
    }),
    [],
  );

  return (
    <SheetHostContext.Provider value={api}>
      {children}
      {Object.entries(sheets).map(([id, props]) => (
        <SheetOverlay key={id} {...props} />
      ))}
    </SheetHostContext.Provider>
  );
}

/** Declares a sheet; it is drawn by the nearest <SheetHost>. */
export function ModalBottomSheet({ visible, onClose, children }: SheetProps) {
  const host = useContext(SheetHostContext);
  const id = useId();

  // Re-send the latest props on every render so the sheet shows current content.
  useEffect(() => {
    host?.set(id, { visible, onClose, children });
  });
  useEffect(() => () => host?.remove(id), [host, id]);

  return null;
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

/** Scroll state of the (single) SheetScrollView inside a sheet. */
interface SheetScroll {
  position: number;
  max: { current: number };
  /** Scroll the content (clamped to its ends). */
  scrollTo: (value: number) => void;
  /** Height of the on-screen keyboard, 0 when hidden. */
  keyboard: number;
}

const SheetScrollContext = createContext<SheetScroll | null>(null);

function SheetOverlay({ visible, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [shown, setShown] = useState(visible);
  const [offset, setOffsetState] = useState(OFFSCREEN);
  const [scroll, setScrollState] = useState(0);
  const offsetRef = useRef(OFFSCREEN);
  const scrollRef = useRef(0);
  const scrollMax = useRef(0);
  const dragStart = useRef(0);
  const cancelMotion = useRef<() => void>(() => {});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const setOffset = useCallback((value: number) => {
    offsetRef.current = value;
    setOffsetState(value);
  }, []);
  const setScroll = useCallback((value: number) => {
    scrollRef.current = value;
    setScrollState(value);
  }, []);

  const slideTo = useCallback(
    (target: number, duration: number, done?: () => void) => {
      cancelMotion.current();
      const from = offsetRef.current;
      cancelMotion.current = tween(duration, (t) => setOffset(from + (target - from) * t), done);
    },
    [setOffset],
  );

  // Slide in when opened; slide out, then stop drawing, when closed.
  useEffect(() => {
    if (visible) {
      setShown(true);
      setScroll(0);
      slideTo(0, 260);
    } else if (shown) {
      slideTo(OFFSCREEN, 220, () => setShown(false));
    }
  }, [visible]);

  useEffect(() => () => cancelMotion.current(), []);

  // Android Back closes the sheet instead of leaving the screen.
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);

  const responder = useRef(
    PanResponder.create({
      // Capture phase: the sheet takes clearly vertical drags even when they start on
      // a button, a field or the list. Plain taps never reach this.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderGrant: () => {
        cancelMotion.current();
        dragStart.current = scrollRef.current;
      },
      onPanResponderMove: (_, g) => {
        // Upward movement scrolls the list; anything past its top pulls the sheet down.
        const wanted = dragStart.current - g.dy;
        if (wanted >= 0) {
          setScroll(Math.min(wanted, scrollMax.current));
          if (offsetRef.current !== 0) setOffset(0);
        } else {
          if (scrollRef.current !== 0) setScroll(0);
          setOffset(-wanted);
        }
      },
      onPanResponderRelease: (_, g) => {
        const pulled = g.dy - dragStart.current;
        if (pulled > 0 && (pulled > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY)) {
          closeRef.current();
          return;
        }
        slideTo(0, 220);
        if (pulled <= 0 && scrollMax.current > 0 && Math.abs(g.vy) > 0.1) {
          // Fling: keep the list gliding and slowing down, stopping at its ends.
          let velocity = -g.vy; // pt per ms; positive moves further down the list
          let last = Date.now();
          let frame = 0;
          const glide = () => {
            const now = Date.now();
            const dt = now - last;
            last = now;
            const next = Math.max(0, Math.min(scrollRef.current + velocity * dt, scrollMax.current));
            setScroll(next);
            velocity *= Math.pow(0.995, dt);
            if (Math.abs(velocity) > 0.02 && next > 0 && next < scrollMax.current) frame = requestAnimationFrame(glide);
          };
          frame = requestAnimationFrame(glide);
          cancelMotion.current = () => cancelAnimationFrame(frame);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => slideTo(0, 220),
    }),
  ).current;

  const keyboard = useKeyboardHeight();
  const scrollState = useMemo<SheetScroll>(
    () => ({
      position: scroll,
      max: scrollMax,
      scrollTo: (value: number) => setScroll(Math.max(0, Math.min(value, scrollMax.current))),
      keyboard,
    }),
    [scroll, keyboard, setScroll],
  );

  if (!shown) return null;

  // The backdrop fades with the sheet's distance from its resting place.
  const backdropOpacity = Math.max(0, 1 - offset / 400);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable style={[styles.backdrop, { opacity: backdropOpacity }]} onPress={onClose} />
      <View
        style={[
          styles.sheetContainer,
          {
            // Above the keyboard while it is open (the safe-area inset is then under the keyboard).
            bottom: keyboard,
            paddingBottom: keyboard > 0 ? Spacing.md : Spacing.xl + insets.bottom,
            maxHeight: Math.max(240, windowHeight - keyboard - insets.top - Spacing.md),
            transform: [{ translateY: offset }],
          },
        ]}
        {...responder.panHandlers}
      >
        <View style={styles.dragHandleContainer}>
          <View style={styles.dragHandle} />
        </View>
        <SheetScrollContext.Provider value={scrollState}>{children}</SheetScrollContext.Provider>
      </View>
    </View>
  );
}

interface SheetScrollViewProps {
  children: React.ReactNode;
  /** Visible height limit; content taller than this scrolls with the sheet's drag. */
  maxHeight: number;
  style?: ViewStyle;
}

/** Smallest visible height of the scroll area while the keyboard is open. */
const MIN_VISIBLE = 140;

/**
 * Scrollable area for long content inside a ModalBottomSheet (one per sheet).
 * While the keyboard is open the area gets shorter by the keyboard's height (the
 * sheet itself is lifted above the keyboard), and the focused field is scrolled
 * into view, so no input is ever hidden behind the keyboard.
 */
export function SheetScrollView({ children, maxHeight, style }: SheetScrollViewProps) {
  const scroll = useContext(SheetScrollContext);
  const viewport = useRef(0);
  const content = useRef(0);
  const contentView = useRef<View>(null);

  const updateMax = () => {
    if (scroll) scroll.max.current = Math.max(0, content.current - viewport.current);
  };

  const keyboard = scroll?.keyboard ?? 0;
  const visible = keyboard > 0 ? Math.max(MIN_VISIBLE, maxHeight - keyboard) : maxHeight;

  // Bring the focused field into view once the keyboard (and the new height) settle.
  useEffect(() => {
    if (!scroll || keyboard <= 0) return;
    const timer = setTimeout(() => {
      const focused = TextInput.State.currentlyFocusedInput?.() as unknown as View | null;
      const container = contentView.current;
      if (!focused || !container) return;
      try {
        focused.measureLayout(
          container as any,
          (_x, y, _w, h) => {
            const top = scroll.position;
            const bottom = top + viewport.current;
            if (y < top) scroll.scrollTo(y - 12);
            else if (y + h > bottom) scroll.scrollTo(y + h - viewport.current + 12);
          },
          () => {},
        );
      } catch {}
    }, 80);
    return () => clearTimeout(timer);
  }, [keyboard, visible]);

  if (!scroll) return <View style={[{ maxHeight }, style]}>{children}</View>;

  return (
    <View
      style={[{ maxHeight: visible, overflow: 'hidden' }, style]}
      onLayout={(e: LayoutChangeEvent) => {
        viewport.current = e.nativeEvent.layout.height;
        updateMax();
      }}
    >
      <View
        ref={contentView}
        collapsable={false}
        style={{ transform: [{ translateY: -scroll.position }] }}
        onLayout={(e: LayoutChangeEvent) => {
          content.current = e.nativeEvent.layout.height;
          updateMax();
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrim,
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceBorder,
  },
});
