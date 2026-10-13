import React from 'react';
import { StyleSheet, View } from 'react-native';
import { moderateScale } from 'react-native-size-matters/extend';
export function TabIcon({ name, color, bg, size = 22 }) {
  const s = moderateScale(size);
  switch (name) {
    case 'inside':
      return (
        <View
          style={{
            width: s,
            height: s,
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              width: s * 0.38,
              height: s * 0.38,
              borderRadius: s,
              borderWidth: 2,
              borderColor: color,
              marginBottom: moderateScale(2),
            }}
          />
          <View
            style={{
              width: s * 0.72,
              height: s * 0.36,
              borderTopLeftRadius: s,
              borderTopRightRadius: s,
              borderWidth: 2,
              borderBottomWidth: 0,
              borderColor: color,
            }}
          />
        </View>
      );
    case 'log':
      return (
        <View
          style={{
            width: s,
            height: s,
            justifyContent: 'center',
            gap: s * 0.16,
            paddingHorizontal: s * 0.12,
          }}
        >
          {[1, 0.8, 1, 0.6].map((w, i) => (
            <View
              key={i}
              style={{
                height: moderateScale(2),
                width: `${w * 100}%`,
                backgroundColor: color,
                borderRadius: moderateScale(1),
              }}
            />
          ))}
        </View>
      );
    case 'plus':
      return (
        <View
          style={{
            width: s,
            height: s,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              position: 'absolute',
              width: s * 0.9,
              height: moderateScale(3),
              backgroundColor: color,
              borderRadius: moderateScale(2),
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: moderateScale(3),
              height: s * 0.9,
              backgroundColor: color,
              borderRadius: moderateScale(2),
            }}
          />
        </View>
      );
    case 'today':
      return (
        <View
          style={{
            width: s,
            height: s,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: s * 0.1,
            paddingBottom: s * 0.08,
          }}
        >
          {[0.45, 0.8, 0.6].map((h, i) => (
            <View
              key={i}
              style={{
                width: s * 0.18,
                height: s * h,
                backgroundColor: color,
                borderRadius: moderateScale(1),
              }}
            />
          ))}
        </View>
      );
    case 'mail':
      return (
        <View
          style={{
            width: s,
            height: s,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: s * 0.92,
              height: s * 0.66,
              borderWidth: 2,
              borderColor: color,
              borderRadius: moderateScale(2),
              overflow: 'hidden',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: s * 0.62,
                height: s * 0.62,
                borderWidth: 2,
                borderColor: color,
                transform: [{ translateY: -s * 0.36 }, { rotate: '45deg' }],
              }}
            />
          </View>
        </View>
      );
    case 'settings':
      return (
        <View
          style={{
            width: s,
            height: s,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              { alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            {[0, 45, 90, 135].map(deg => (
              <View
                key={deg}
                style={{
                  position: 'absolute',
                  width: s * 0.9,
                  height: s * 0.18,
                  backgroundColor: color,
                  borderRadius: moderateScale(1),
                  transform: [{ rotate: `${deg}deg` }],
                }}
              />
            ))}
          </View>
          <View
            style={{
              width: s * 0.62,
              height: s * 0.62,
              borderRadius: s,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: s * 0.26,
              height: s * 0.26,
              borderRadius: s,
              backgroundColor: bg,
            }}
          />
        </View>
      );
  }
}
