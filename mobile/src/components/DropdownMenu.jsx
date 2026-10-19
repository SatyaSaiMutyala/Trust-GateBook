import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { TickIcon } from './Glyphs';

const ROW_H = MIN_TOUCH;
const MAX_LIST_H = verticalScale(280);

/**
 * Measure `ref` in window coordinates, closing the keyboard first so the layout has settled.
 * @param {React.RefObject<any>} ref
 * @param {(anchor: {x:number,y:number,w:number,h:number}) => void} done
 */
export function measureAnchor(ref, done) {
  const measure = () =>
    ref.current?.measureInWindow((x, y, w, h) => done({ x, y, w, h }));
  if (Keyboard.isVisible()) {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      sub.remove();
      requestAnimationFrame(measure);
    });
    Keyboard.dismiss();
  } else {
    measure();
  }
}

/**
 * Where the menu goes: directly below the field, or above it when there isn't room below.
 * Shared with SelectField so the field can square off the corners on the joined side.
 */
export function placeDropdown(anchor, count, winH, insets) {
  const listH = Math.min(count * ROW_H + 2, MAX_LIST_H);
  const gap = verticalScale(8);
  const below = winH - (anchor.y + anchor.h) - insets.bottom - gap;
  const above = anchor.y - insets.top - gap;
  const up = below < Math.min(listH, ROW_H * 4) && above > below;
  return {
    up,
    maxHeight: Math.max(ROW_H, Math.min(listH, up ? above : below)),
  };
}

/**
 * Option list anchored to a field: same left edge and width, attached to its bottom border
 * (or top border when it opens upwards). Tapping outside closes it.
 * `minWidth` lets a compact trigger (filter pill) open a wider list; it stays on screen and
 * lines up with the trigger's right edge when it would overflow.
 */
export function DropdownMenu({
  anchor,
  options,
  value,
  onSelect,
  onClose,
  minWidth = 0,
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const startW = useRef(winW);

  // Rotation / split-screen moves the field: close rather than float in the wrong place.
  useEffect(() => {
    if (winW !== startW.current) onClose();
  }, [winW, onClose]);

  if (!anchor) return null;
  const { up, maxHeight } = placeDropdown(anchor, options.length, winH, insets);
  const width = Math.min(Math.max(anchor.w, minWidth), winW - 16);
  const left = Math.max(
    8,
    anchor.x + width > winW - 8 ? anchor.x + anchor.w - width : anchor.x,
  );
  const selectedIndex = Math.max(
    0,
    options.findIndex(o => o.value === value),
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close list"
      />
      <View
        style={[
          styles.panel,
          up ? styles.panelUp : styles.panelDown,
          // Wider than its trigger (compact filter pill): round the corner that overhangs.
          width > anchor.w + 1 &&
            (left < anchor.x
              ? up
                ? { borderBottomLeftRadius: radius.control }
                : { borderTopLeftRadius: radius.control }
              : up
              ? { borderBottomRightRadius: radius.control }
              : { borderTopRightRadius: radius.control }),
          up
            ? { bottom: winH - anchor.y - 1 }
            : { top: anchor.y + anchor.h - 1 },
          {
            left,
            width,
            maxHeight,
            backgroundColor: c.surface,
            borderColor: c.accent,
          },
        ]}
      >
        <FlatList
          data={options}
          keyExtractor={o => String(o.value)}
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({
            length: ROW_H,
            offset: ROW_H * index,
            index,
          })}
          initialScrollIndex={
            options.length * ROW_H > maxHeight ? selectedIndex : undefined
          }
          renderItem={({ item, index }) => {
            const selected = item.value === value;
            return (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderTopColor: c.line,
                    borderTopWidth: index ? StyleSheet.hairlineWidth : 0,
                    backgroundColor: pressed
                      ? c.sunk
                      : selected
                      ? c.accentSoft
                      : 'transparent',
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.rowText,
                    {
                      color: c.ink,
                      fontFamily: selected ? fonts.bodySemi : fonts.body,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {selected ? <TickIcon color={c.ink} size={13} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  panel: {
    position: 'absolute',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: '10@ms',
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  panelDown: {
    borderBottomLeftRadius: radius.control,
    borderBottomRightRadius: radius.control,
  },
  panelUp: {
    borderTopLeftRadius: radius.control,
    borderTopRightRadius: radius.control,
  },
  row: {
    height: ROW_H,
    paddingHorizontal: '12@s',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
  },
  rowText: { flex: 1, fontSize: '15@ms' },
});
