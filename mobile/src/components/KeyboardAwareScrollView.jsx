import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

const GAP = 24; // space kept between the focused field and the keyboard

/**
 * A ScrollView that keeps the field being typed in above the keyboard, on Android and iOS.
 * (With edge-to-edge on Android the window no longer resizes for the keyboard, so
 * `windowSoftInputMode="adjustResize"` alone does nothing.)
 * When the keyboard opens it measures how much of this view it covers, adds that much space at the bottom
 * of the content, and scrolls the focused field into view. Same props as ScrollView; the ref is the ScrollView.
 * `component={FlatList}` does the same for a FlatList (the ref is then the FlatList).
 * Inside a bottom sheet (already lifted by KeyboardAvoidingRoot): `addSpace={false}` only scrolls the field into view,
 * and `containerStyle` replaces the default `flex: 1` (a sheet sizes to its content: pass `{ flexShrink: 1 }`).
 */
export const KeyboardAwareScrollView = forwardRef(
  function KeyboardAwareScrollView(
    {
      component: Inner = ScrollView,
      addSpace = true,
      containerStyle,
      contentContainerStyle,
      onScroll,
      children,
      ...rest
    },
    ref,
  ) {
    const box = useRef(null);
    const scroll = useRef(null);
    const offset = useRef(0);
    const keyboardTop = useRef(null);
    const [cover, setCover] = useState(0);

    const setRefs = useCallback(
      node => {
        scroll.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    /** Scroll to y (ScrollView: scrollTo; FlatList: scrollToOffset). */
    const scrollToY = useCallback(y => {
      const node = scroll.current;
      if (node?.scrollTo) node.scrollTo({ y, animated: true });
      else node?.scrollToOffset?.({ offset: y, animated: true });
    }, []);

    /** Scrolls so the focused field sits above the keyboard. */
    const reveal = useCallback(() => {
      const input = TextInput.State.currentlyFocusedInput?.();
      const top = keyboardTop.current;
      if (!input || top == null || !scroll.current || !box.current) return;
      input.measureInWindow((_x, y, _w, h) => {
        box.current?.measureInWindow((_bx, boxY) => {
          const below = y + h + GAP - top; // how far the field's bottom is under the keyboard
          const above = boxY - y + GAP; // how far its top is above this view
          if (below > 0) scrollToY(offset.current + below);
          else if (above > 0) scrollToY(Math.max(0, offset.current - above));
        });
      });
    }, [scrollToY]);

    useEffect(() => {
      const ios = Platform.OS === 'ios';
      const show = Keyboard.addListener(
        ios ? 'keyboardWillShow' : 'keyboardDidShow',
        e => {
          const top = e.endCoordinates.screenY;
          keyboardTop.current = top;
          box.current?.measureInWindow((_x, y, _w, h) => {
            if (addSpace) setCover(Math.max(0, y + h - top));
            // After the extra space is laid out.
            setTimeout(reveal, ios ? 250 : 60);
          });
        },
      );
      const hide = Keyboard.addListener(
        ios ? 'keyboardWillHide' : 'keyboardDidHide',
        () => {
          keyboardTop.current = null;
          setCover(0);
        },
      );
      return () => {
        show.remove();
        hide.remove();
      };
    }, [reveal, addSpace]);

    const base = StyleSheet.flatten(contentContainerStyle) ?? {};
    return (
      <View ref={box} style={containerStyle ?? styles.fill} collapsable={false}>
        <Inner
          ref={setRefs}
          // No scroll bars in the app (a caller can still turn them on).
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          {...rest}
          // A tap on another field while the keyboard is open: bring that one into view too.
          onTouchEnd={() => {
            if (keyboardTop.current != null) setTimeout(reveal, 120);
          }}
          scrollEventThrottle={16}
          onScroll={e => {
            offset.current = e.nativeEvent.contentOffset.y;
            onScroll?.(e);
          }}
          contentContainerStyle={[
            base,
            { paddingBottom: (base.paddingBottom ?? 0) + cover },
          ]}
        >
          {children}
        </Inner>
      </View>
    );
  },
);

/**
 * Root of a modal bottom sheet: lifts its content (laid out with `justifyContent: 'flex-end'`) to sit on top of the
 * keyboard, on Android and iOS. Replaces KeyboardAvoidingView, which does nothing on Android here.
 */
export function KeyboardAvoidingRoot({ style, children }) {
  const root = useRef(null);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(
      ios ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        const top = e.endCoordinates.screenY;
        root.current?.measureInWindow((_x, y, _w, h) =>
          setLift(Math.max(0, y + h - top)),
        );
      },
    );
    const hide = Keyboard.addListener(
      ios ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setLift(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <View
      ref={root}
      style={[style, { paddingBottom: lift }]}
      collapsable={false}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
