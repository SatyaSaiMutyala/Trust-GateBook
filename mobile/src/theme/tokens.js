import {
  moderateScale,
  scale,
  verticalScale,
} from 'react-native-size-matters/extend';

export const light = {
  bg: '#ECEFED',
  surface: '#FFFFFF',
  sunk: '#F5F7F6',
  ink: '#15201C',
  muted: '#5B6964',
  faint: '#9AA6A1', // inactive tab icons / labels: clearly lighter than `muted`
  line: '#D3DAD6',
  accent: '#E9A316',
  accentInk: '#1C1503',
  accentSoft: '#FBEFD2',
  rail: '#13201B',
  railInk: '#DDE5E1',
  railMuted: '#7E918A',
  ok: '#1D8752',
  okSoft: '#DDF1E6',
  warn: '#B9620F',
  warnSoft: '#FBE8D6',
  bad: '#BE3535',
  badSoft: '#F8DEDE',
  onInk: '#FFFFFF',
  overlay: 'rgba(10,16,14,0.55)',
};
export const dark = {
  bg: '#0D1412',
  surface: '#16201D',
  sunk: '#111A17',
  ink: '#E6ECE9',
  muted: '#93A29C',
  faint: '#5E6E68',
  line: '#26332F',
  accent: '#F2B233',
  accentInk: '#1C1503',
  accentSoft: '#3A2E12',
  rail: '#0A100E',
  railInk: '#DDE5E1',
  railMuted: '#71847D',
  ok: '#45B97C',
  okSoft: '#173326',
  warn: '#E39245',
  warnSoft: '#3A2614',
  bad: '#E36565',
  badSoft: '#3B1C1C',
  onInk: '#0D1412',
  overlay: 'rgba(0,0,0,0.65)',
};
/*
 * Sizing tokens, already scaled with react-native-size-matters so components consume them directly:
 * scale() for horizontal sizes, verticalScale() for heights / vertical spacing,
 * moderateScale() (factor 0.5) for font sizes, radii, icon sizes and touch targets.
 * Hairline (1 px) borders are left unscaled.
 */
export const radius = {
  panel: moderateScale(10),
  control: moderateScale(8),
  chip: moderateScale(20),
  sheet: moderateScale(16),
};

/** Even spacing (gaps, padding on both axes). */
export const spacing = {
  xxs: moderateScale(2),
  xs: moderateScale(4),
  sm: moderateScale(8),
  md: moderateScale(12),
  lg: moderateScale(16),
  xl: moderateScale(20),
  xxl: moderateScale(28),
};
/** @deprecated alias of spacing */
export const space = spacing;

/** Horizontal gutters (screen side padding etc.). */
export const gutter = {
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(20),
};
/** Vertical rhythm (screen top/bottom padding, section gaps). */
export const vgap = {
  xs: verticalScale(4),
  sm: verticalScale(8),
  md: verticalScale(12),
  lg: verticalScale(16),
  xl: verticalScale(20),
  xxl: verticalScale(32),
};

/** Standard control height (40 pt); small controls add hitSlop to keep a 44 pt touch area. */
export const MIN_TOUCH = moderateScale(40);

/** Font sizes and matching line heights. */
export const font = {
  h1: moderateScale(24),
  h1Line: moderateScale(28),
  h2: moderateScale(18),
  h2Line: moderateScale(22),
  h3: moderateScale(15),
  h3Line: moderateScale(19),
  eyebrow: moderateScale(11),
  eyebrowLine: moderateScale(14),
  big: moderateScale(28),
  bigLine: moderateScale(32),
  body: moderateScale(14),
  bodyLine: moderateScale(19),
  input: moderateScale(15),
  small: moderateScale(12),
  smallLine: moderateScale(16),
  tiny: moderateScale(10),
  tinyLine: moderateScale(13),
  mono: moderateScale(13),
  monoLine: moderateScale(17),
  monoSmall: moderateScale(11),
  monoSmallLine: moderateScale(14),
  passHero: moderateScale(32),
  passHeroLine: moderateScale(38),
  brand: moderateScale(18),
};

/** Icon sizes. */
export const icon = {
  sm: moderateScale(14),
  md: moderateScale(20),
  lg: moderateScale(22),
};

/**
 * Bundled font files (assets/fonts, linked with react-native-asset). Each file is named after its PostScript name,
 * which is what iOS resolves; Android resolves the same string from assets/fonts/<name>.ttf.
 */
export const fonts = {
  display: 'BarlowCondensed-Bold',
  displaySemi: 'BarlowCondensed-SemiBold',
  body: 'Barlow-Regular',
  bodyMedium: 'Barlow-Medium',
  bodySemi: 'Barlow-SemiBold',
  mono: 'JetBrainsMono-Medium',
};
