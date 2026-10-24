import React from 'react';
import { StatusBar } from 'react-native';
import { useTheme } from '../theme';

/**
 * Status bar for screens with a light (surface-coloured) top area instead of the dark app bar: dark icons on light,
 * light icons in dark mode. Rendered while the screen is open; closing it restores the app-wide light icons.
 */
export function SurfaceStatusBar() {
  const { c, dark } = useTheme();
  return (
    <StatusBar
      barStyle={dark ? 'light-content' : 'dark-content'}
      backgroundColor={c.surface}
    />
  );
}
