import { useColorScheme } from 'react-native';
import { dark, font, fonts, light } from './tokens';
export * from './tokens';
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { dark: isDark, c: isDark ? dark : light };
}
/** Typography helpers (scaled sizes from `font`). Headings are uppercase Barlow Condensed 700. */
export const typo = {
  h1: {
    fontFamily: fonts.display,
    fontSize: font.h1,
    lineHeight: font.h1Line,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: font.h2,
    lineHeight: font.h2Line,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  h3: {
    fontFamily: fonts.display,
    fontSize: font.h3,
    lineHeight: font.h3Line,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eyebrow: {
    fontFamily: fonts.displaySemi,
    fontSize: font.eyebrow,
    lineHeight: font.eyebrowLine,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  big: {
    fontFamily: fonts.display,
    fontSize: font.big,
    lineHeight: font.bigLine,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: font.bodyLine,
  },
  bodyMedium: {
    fontFamily: fonts.bodyMedium,
    fontSize: font.body,
    lineHeight: font.bodyLine,
  },
  bodySemi: {
    fontFamily: fonts.bodySemi,
    fontSize: font.body,
    lineHeight: font.bodyLine,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: font.small,
    lineHeight: font.smallLine,
  },
  smallMedium: {
    fontFamily: fonts.bodyMedium,
    fontSize: font.small,
    lineHeight: font.smallLine,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: font.small,
    lineHeight: font.smallLine,
  },
  tiny: {
    fontFamily: fonts.bodyMedium,
    fontSize: font.tiny,
    lineHeight: font.tinyLine,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: font.mono,
    lineHeight: font.monoLine,
  },
  monoSmall: {
    fontFamily: fonts.mono,
    fontSize: font.monoSmall,
    lineHeight: font.monoSmallLine,
  },
};

// Android pads text above/below by default (iOS doesn't), which shifts labels and makes rows taller.
// Turn it off for every shared text style so both platforms lay text out the same way.
for (const style of Object.values(typo)) style.includeFontPadding = false;
