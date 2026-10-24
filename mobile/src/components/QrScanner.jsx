import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureCameraPermission } from '../utils/camera';
import { typo } from '../theme';

const ACCENT = '#F5A300';

/**
 * Full-screen QR scanner. Each code read goes to `parse` (text → value or null); the first value it accepts is passed
 * to `onCode` once, and anything else shows `invalidText` for a moment. Torch button for dark corridors.
 * `onClose` on Cancel / back, and when the camera permission is refused (with `onDenied`).
 */
export function QrScanner({
  visible,
  title = 'Scan QR code',
  hint = 'Point the camera at the QR code',
  invalidText = 'That QR code is not one of ours',
  parse,
  onCode,
  onClose,
  onDenied,
}) {
  const insets = useSafeAreaInsets();
  const [allowed, setAllowed] = useState(false);
  const [torch, setTorch] = useState(false);
  const [wrong, setWrong] = useState(false);
  const done = useRef(false);
  const wrongTimer = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;
    done.current = false;
    let live = true;
    ensureCameraPermission(
      'TruSentinel needs the camera to scan the QR codes at patrol checkpoints.',
    ).then(ok => {
      if (!live) return;
      if (ok) setAllowed(true);
      else {
        onDenied?.();
        onClose();
      }
    });
    return () => {
      live = false;
      setAllowed(false);
      setTorch(false);
      setWrong(false);
      clearTimeout(wrongTimer.current);
    };
    // Ask once each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onRead = e => {
    if (done.current) return;
    const value = parse(e.nativeEvent.codeStringValue);
    if (value) {
      done.current = true;
      onCode(value);
      return;
    }
    setWrong(true);
    clearTimeout(wrongTimer.current);
    wrongTimer.current = setTimeout(() => setWrong(false), 2000);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        {allowed ? (
          <Camera
            style={StyleSheet.absoluteFill}
            scanBarcode
            onReadCode={onRead}
            showFrame
            barcodeFrameSize={{ width: 260, height: 260 }}
            frameColor={ACCENT}
            laserColor={ACCENT}
            torchMode={torch ? 'on' : 'off'}
            flashMode="off"
          />
        ) : null}
        <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
          <Text accessibilityRole="header" style={[typo.h2, styles.light]}>
            {title}
          </Text>
          <Text style={[typo.body, styles.light, { opacity: 0.85 }]}>
            {hint}
          </Text>
        </View>
        {wrong ? (
          <View style={styles.wrong} accessibilityLiveRegion="polite">
            <Text style={[typo.bodyMedium, { color: '#fff' }]}>
              {invalidText}
            </Text>
          </View>
        ) : null}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
            onPress={() => setTorch(t => !t)}
            style={[styles.btn, torch && styles.btnOn]}
          >
            <Text style={[typo.bodySemi, { color: torch ? '#111' : '#fff' }]}>
              {torch ? 'Torch on' : 'Torch'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel scanning"
            onPress={onClose}
            style={styles.btn}
          >
            <Text style={[typo.bodySemi, { color: '#fff' }]}>
              Type code instead
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  light: { color: '#fff', textAlign: 'center' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  wrong: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 140,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(200,40,40,0.92)',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOn: { backgroundColor: ACCENT, borderColor: ACCENT },
});
