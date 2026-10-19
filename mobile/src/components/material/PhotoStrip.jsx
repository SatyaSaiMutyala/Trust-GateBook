import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { useToast } from '../../store/hooks';
import { radius, typo, useTheme } from '../../theme';
import { captureImage } from '../../utils/camera';
import { errorMessage } from '../../store/api';

/**
 * Several photos (challan pages, boxes): thumbnails with remove, plus a camera tile up to `max`.
 * `value` = local URIs.
 */
export function PhotoStrip({
  title,
  label,
  value,
  onChange,
  max = 4,
  kind = 'challan',
  required,
  error,
  hint,
}) {
  const { c } = useTheme();
  const toast = useToast();
  const add = async () => {
    try {
      const uri = await captureImage(kind);
      if (uri) onChange([...value, uri]);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={[typo.label, { color: error ? c.bad : c.muted }]}>
        {title}
        {required ? (
          <Text style={{ color: c.bad }}> *</Text>
        ) : (
          <Text> (optional)</Text>
        )}
      </Text>
      <View style={styles.row}>
        {value.map((uri, i) => (
          <View key={uri} style={[styles.tile, { borderColor: c.line }]}>
            <Image
              source={{ uri }}
              style={styles.img}
              accessibilityLabel={`${label} ${i + 1}`}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${label} ${i + 1}`}
              onPress={() => onChange(value.filter((_, j) => j !== i))}
              hitSlop={6}
              style={styles.remove}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {value.length < max ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={add}
            style={({ pressed }) => [
              styles.tile,
              styles.add,
              {
                borderColor: error ? c.bad : c.line,
                backgroundColor: error ? c.badSoft : c.sunk,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>📷</Text>
            <Text style={[typo.small, { color: c.muted, textAlign: 'center' }]}>
              {label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <Text style={[typo.small, { color: c.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = ScaledSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  tile: {
    width: '86@ms',
    height: '86@ms',
    borderRadius: radius.control,
    borderWidth: 1,
    overflow: 'hidden',
  },
  add: {
    borderStyle: 'dashed',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4@ms',
  },
  img: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 12 },
});
