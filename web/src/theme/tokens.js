// Colour tokens: the AIMS 2.0 web palette (Trustlab's shared look). Light only — no dark mode.
export const lightTokens = {
  bg: '#F4F6F8', // page canvas
  surface: '#FFFFFF',
  sunk: '#EDF1F4', // quiet fills: locked fields, placeholders, neutral chips
  ink: '#10151C',
  muted: '#4A5763', // secondary text
  faint: '#7E8A96', // muted text, hints
  line: '#DDE3E9',
  line2: '#EDF1F4', // hairlines: table rows, sub-dividers
  accent: '#0F766E', // teal: primary actions, focus, active states
  accentHover: '#0C5F58',
  accentDark: '#0B5F58',
  accentInk: '#FFFFFF',
  accentSoft: '#E6F2F1',
  gold: '#FFC81F',
  goldDark: '#E0A800',
  head: '#20605B', // panel title bars
  headRule: '#F4C430', // 2px rule under panel titles
  colRule: '#F94C8E', // rule under table column labels
  rail: '#0E3529', // sidebar / app bar (solid fallback of RAIL_BG)
  railInk: '#E2EDE8',
  railMuted: '#8FB0A5',
  ok: '#1E7A45',
  okSoft: '#E7F3EC',
  warn: '#B4700B',
  warnSoft: '#FCF1DF',
  bad: '#B3261E',
  badSoft: '#FBEAE9',
  info: '#1B5E9E',
  infoSoft: '#E8F1F9',
  violet: '#6B4E9B',
  violetSoft: '#F0EBF7',
  grey: '#5B6874',
  greySoft: '#EDF0F3',
};
/** Sidebar / phone app bar background (AIMS rail gradient). */
export const RAIL_BG =
  'radial-gradient(125% 46% at 0% 100%, rgba(45,166,143,.24) 0%, rgba(45,166,143,0) 64%), ' +
  'linear-gradient(172deg, #0A2620 0%, #0E3529 28%, #134A38 66%, #1A6249 100%)';
export const fonts = {
  display: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  body: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};
export const radius = { panel: 6, control: 6, chip: 20 };
export const SHADOW = '0 1px 2px rgba(16,21,28,.06), 0 4px 12px rgba(16,21,28,.05)';
export const MENU_SHADOW = '0 10px 28px rgba(16,21,28,.16)';
/** Shell breakpoint: phone layout below 861 px. Used as the theme's `md` breakpoint. */
export const DESKTOP_MIN = 861;
/** Sidebar width: expanded / collapsed to icons. */
export const RAIL_WIDTH = 258;
export const RAIL_COLLAPSED = 66;
export const TOPBAR_HEIGHT = 60;
