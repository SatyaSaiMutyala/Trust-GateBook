import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fileUrl } from '../api/config';
import { fonts } from '../theme';
import { ScaledSheet } from 'react-native-size-matters/extend';

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 280;

const distance = touches => {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/**
 * One photo, fitted to the screen, with pinch-to-zoom, drag-to-pan while zoomed and double-tap
 * to toggle zoom. Pure JS (PanResponder + Animated), so it behaves the same on iOS and Android.
 */
function ZoomableImage({ uri, width, height, onZoomChange, label }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const s = useRef({
    scale: 1,
    x: 0,
    y: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    startDist: 0,
    pinching: false,
  });
  const lastTap = useRef(0);
  const [failed, setFailed] = useState(false);

  const clampPan = useCallback(
    (x, y, z) => {
      const maxX = ((z - 1) * width) / 2;
      const maxY = ((z - 1) * height) / 2;
      return [
        Math.max(-maxX, Math.min(maxX, x)),
        Math.max(-maxY, Math.min(maxY, y)),
      ];
    },
    [width, height],
  );

  const animateTo = useCallback(
    (z, x = 0, y = 0) => {
      s.current.scale = z;
      s.current.x = x;
      s.current.y = y;
      onZoomChange(z > 1.01);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: z,
          useNativeDriver: true,
          friction: 7,
        }),
        Animated.spring(tx, { toValue: x, useNativeDriver: true, friction: 7 }),
        Animated.spring(ty, { toValue: y, useNativeDriver: true, friction: 7 }),
      ]).start();
    },
    [scale, tx, ty, onZoomChange],
  );

  const responder = useRef(null);
  responder.current = PanResponder.create({
    // Two fingers always zoom; one finger only pans when already zoomed (otherwise the pager swipes).
    onStartShouldSetPanResponder: e => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (e, g) =>
      e.nativeEvent.touches.length === 2 ||
      (s.current.scale > 1.01 && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2)),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      const st = s.current;
      st.startScale = st.scale;
      st.startX = st.x;
      st.startY = st.y;
      st.pinching = e.nativeEvent.touches.length === 2;
      st.startDist = st.pinching ? distance(e.nativeEvent.touches) : 0;
    },
    onPanResponderMove: (e, g) => {
      const st = s.current;
      const touches = e.nativeEvent.touches;
      if (touches.length === 2) {
        if (!st.pinching) {
          st.pinching = true;
          st.startDist = distance(touches);
          st.startScale = st.scale;
        }
        const z = Math.max(
          1,
          Math.min(
            MAX_ZOOM,
            (st.startScale * distance(touches)) / st.startDist,
          ),
        );
        st.scale = z;
        scale.setValue(z);
        const [x, y] = clampPan(st.x, st.y, z);
        st.x = x;
        st.y = y;
        tx.setValue(x);
        ty.setValue(y);
      } else if (st.scale > 1.01 && !st.pinching) {
        const [x, y] = clampPan(st.startX + g.dx, st.startY + g.dy, st.scale);
        st.x = x;
        st.y = y;
        tx.setValue(x);
        ty.setValue(y);
      }
    },
    onPanResponderRelease: () => {
      const st = s.current;
      st.pinching = false;
      if (st.scale < 1.05) animateTo(1);
      else onZoomChange(true);
    },
  });

  // Reset when the page scrolls away / the photo changes.
  useEffect(() => () => onZoomChange(false), [onZoomChange]);

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      animateTo(s.current.scale > 1.01 ? 1 : DOUBLE_TAP_ZOOM);
    } else {
      lastTap.current = now;
    }
  };

  return (
    <View style={{ width, height }} {...responder.current.panHandlers}>
      <Pressable
        onPress={onTap}
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityHint="Double-tap to zoom. Pinch to zoom, drag to move when zoomed."
        style={{ width, height }}
      >
        {failed ? (
          <View style={[styles.failed, { width, height }]}>
            <Text style={styles.failedText}>Photo could not be loaded</Text>
          </View>
        ) : (
          <Animated.Image
            source={{ uri }}
            resizeMode="contain"
            onError={() => setFailed(true)}
            style={{
              width,
              height,
              transform: [{ translateX: tx }, { translateY: ty }, { scale }],
            }}
          />
        )}
      </Pressable>
    </View>
  );
}

/** Small "expand" badge in a photo's corner, hinting that it opens full screen. */
export function ZoomBadge() {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.badgeText}>⤢</Text>
    </View>
  );
}

/**
 * Full-screen photo viewer. `images`: [{ url, label }] (signed API paths or full URLs);
 * opens at `index`; swipe between photos; ✕ / Android back closes.
 */
export function ImagePreview({ images, index = 0, visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef(null);
  const items = (images ?? []).filter(i => i && i.url);

  useEffect(() => {
    if (visible) {
      setPage(index);
      setZoomed(false);
    }
  }, [visible, index]);

  const onZoomChange = useCallback(z => setZoomed(z), []);
  if (!visible || !items.length) return null;
  const current = items[Math.min(page, items.length - 1)];

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed && items.length > 1}
          initialScrollIndex={Math.min(index, items.length - 1)}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(it, i) => `${i}:${it.url}`}
          onMomentumScrollEnd={e =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) => (
            <ZoomableImage
              uri={fileUrl(item.url)}
              label={item.label}
              width={width}
              height={height}
              onZoomChange={onZoomChange}
            />
          )}
        />
        <View
          style={[styles.top, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.caption} numberOfLines={1}>
              {current.label}
            </Text>
            {items.length > 1 ? (
              <Text style={styles.counter}>
                {Math.min(page, items.length - 1) + 1} / {items.length}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        {!zoomed ? (
          <View
            style={[styles.hintWrap, { paddingBottom: insets.bottom + 14 }]}
            pointerEvents="none"
          >
            <Text style={styles.hint}>Pinch or double-tap to zoom</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: '16@s',
    paddingBottom: '10@vs',
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: '12@ms',
  },
  caption: { color: '#FFFFFF', fontFamily: fonts.bodySemi, fontSize: '15@ms' },
  counter: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.mono,
    fontSize: '12@ms',
  },
  close: {
    width: '36@ms',
    height: '36@ms',
    borderRadius: '18@ms',
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: '16@ms', lineHeight: '18@ms' },
  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  hint: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.body,
    fontSize: '12@ms',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: '10@s',
    paddingVertical: '4@vs',
    borderRadius: '12@ms',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    right: '6@ms',
    bottom: '6@ms',
    width: '24@ms',
    height: '24@ms',
    borderRadius: '6@ms',
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: '14@ms', lineHeight: '16@ms' },
  failed: { alignItems: 'center', justifyContent: 'center' },
  failedText: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.body,
    fontSize: '14@ms',
  },
});
