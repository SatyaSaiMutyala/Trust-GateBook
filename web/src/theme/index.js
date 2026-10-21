// Single MUI theme in the AIMS 2.0 look (Trustlab's shared web style): teal primary, gold accent, IBM Plex,
// 6px corners, teal panel title bars, white table heads with a pink rule. Light only.
// Custom palette entries: `gb` (every raw token), `rail`, `accent`, `sunk`. Custom variants: Button `exit`;
// Chip `inside`, `overstay`, `exited`, `pass`, `duration`, `pending`, `issue`; Typography `mono`, `eyebrow`, `display`.
import { createTheme } from '@mui/material/styles';
import { DESKTOP_MIN, fonts, lightTokens as t, MENU_SHADOW, radius, SHADOW } from './tokens';

const palette = {
  mode: 'light',
  primary: { main: t.accent, dark: t.accentDark, light: t.accentSoft, contrastText: t.accentInk },
  secondary: { main: t.gold, dark: t.goldDark, contrastText: t.ink },
  success: { main: t.ok, contrastText: '#FFFFFF' },
  warning: { main: t.warn, contrastText: '#FFFFFF' },
  error: { main: t.bad, contrastText: '#FFFFFF' },
  info: { main: t.info, contrastText: '#FFFFFF' },
  background: { default: t.bg, paper: t.surface },
  text: { primary: t.ink, secondary: t.muted, disabled: t.faint },
  divider: t.line,
  gb: t,
  rail: { main: t.rail, contrastText: t.railInk, muted: t.railMuted },
  accent: { main: t.accent, contrastText: t.accentInk, soft: t.accentSoft },
  sunk: t.sunk,
};

const heading = { fontFamily: fonts.display, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em' };
const monoLabel = { fontFamily: fonts.mono, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' };
const focusRing = { outline: `2px solid ${t.accent}`, outlineOffset: 2 };

/** Chip tone: tinted background + coloured text (AIMS `.chip` tones). */
const tone = (fg, bg) => ({ backgroundColor: bg, color: fg });

export const theme = createTheme({
  cssVariables: { cssVarPrefix: 'gb' },
  palette,
  breakpoints: { values: { xs: 0, sm: 600, md: DESKTOP_MIN, lg: 1200, xl: 1536 } },
  shape: { borderRadius: radius.control },
  typography: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { ...heading, fontSize: '1.25rem' }, // page title (20px)
    h2: { ...heading, fontSize: '1.125rem' },
    h3: { ...heading, fontSize: '1rem' },
    h4: { ...heading, fontSize: '0.875rem', letterSpacing: '0.01em' }, // panel titles
    h5: { ...heading, fontSize: '0.8125rem', letterSpacing: '0.01em' },
    h6: { ...heading, fontSize: '0.75rem', letterSpacing: '0.02em' },
    body1: { fontSize: '0.875rem', lineHeight: 1.5 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
    button: { fontFamily: fonts.body, fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: '0.8125rem' },
    mono: { fontFamily: fonts.mono, fontWeight: 500, fontSize: '0.8125rem', letterSpacing: 0, fontVariantNumeric: 'tabular-nums' },
    eyebrow: {
      fontFamily: fonts.mono,
      fontWeight: 600,
      fontSize: '0.6875rem',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      lineHeight: 1.4,
    },
    overline: {
      fontFamily: fonts.mono,
      fontWeight: 600,
      fontSize: '0.6875rem',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      lineHeight: 1.4,
    },
    display: {
      fontFamily: fonts.mono,
      fontWeight: 600,
      fontSize: '1.75rem',
      lineHeight: 1.1,
      fontVariantNumeric: 'tabular-nums',
    },
  },
  shadows: ['none', SHADOW, SHADOW, ...Array(22).fill(MENU_SHADOW)],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: t.bg,
          color: t.ink,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '::selection': { background: t.accentSoft },
        ':focus-visible': focusRing,
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { transitionDuration: '0.01ms !important', animationDuration: '0.01ms !important' },
        },
      },
    },
    MuiTypography: {
      defaultProps: {
        variantMapping: { mono: 'span', eyebrow: 'div', display: 'div' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: t.surface },
        rounded: { borderRadius: radius.panel },
        outlined: { borderColor: t.line, boxShadow: SHADOW },
      },
    },
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 36,
          borderRadius: radius.control,
          paddingInline: 14,
          whiteSpace: 'nowrap',
          transition: 'background-color .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease',
        },
        sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: '0.78rem' },
        sizeLarge: { minHeight: 44, fontSize: '0.9375rem', paddingInline: 20, fontWeight: 600 },
        startIcon: { marginRight: 6 },
        outlined: {
          borderColor: t.line,
          color: t.muted,
          backgroundColor: t.surface,
          '&:hover': { borderColor: t.faint, color: t.ink, backgroundColor: t.surface },
        },
        outlinedError: {
          borderColor: t.bad,
          color: t.bad,
          '&:hover': { backgroundColor: t.bad, borderColor: t.bad, color: '#FFFFFF' },
        },
        text: { color: t.accent, '&:hover': { backgroundColor: t.accentSoft } },
        containedPrimary: {
          backgroundColor: t.accent,
          color: t.accentInk,
          border: `1px solid ${t.accent}`,
          '&:hover': { backgroundColor: t.accentHover, borderColor: t.accentHover },
        },
        containedError: { '&:hover': { filter: 'brightness(0.92)' } },
        containedSuccess: { '&:hover': { filter: 'brightness(0.92)' } },
      },
      variants: [
        {
          // Check out / leave: dark teal title-bar colour, gold edge (AIMS action buttons).
          props: { variant: 'exit' },
          style: {
            backgroundColor: t.head,
            color: '#FFFFFF',
            border: `1.5px solid ${t.gold}`,
            fontWeight: 600,
            '&:hover': { backgroundColor: t.accentDark },
            '&.Mui-disabled': { opacity: 0.45, color: '#FFFFFF' },
          },
        },
      ],
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: radius.control, '&:hover': { backgroundColor: t.accentSoft } },
      },
    },
    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { borderRadius: radius.chip, fontWeight: 500, fontSize: '0.6875rem', height: 22 },
        sizeMedium: { height: 26, fontSize: '0.75rem' },
        label: { paddingInline: 8 },
        filled: tone(t.grey, t.greySoft),
        colorPrimary: tone(t.accent, t.accentSoft),
        colorSuccess: tone(t.ok, t.okSoft),
        colorWarning: tone(t.warn, t.warnSoft),
        colorError: tone(t.bad, t.badSoft),
        colorInfo: tone(t.info, t.infoSoft),
        outlined: { borderColor: t.line, color: t.muted },
      },
      variants: [
        { props: { variant: 'inside' }, style: tone(t.ok, t.okSoft) },
        { props: { variant: 'overstay' }, style: tone(t.warn, t.warnSoft) },
        { props: { variant: 'exited' }, style: tone(t.grey, t.greySoft) },
        {
          props: { variant: 'pass' },
          style: {
            backgroundColor: t.accent,
            color: t.accentInk,
            fontFamily: fonts.mono,
            fontWeight: 500,
            height: 22,
            fontSize: '0.75rem',
            '& .MuiChip-label': { paddingInline: 8 },
          },
        },
        { props: { variant: 'pending' }, style: tone(t.warn, t.warnSoft) },
        { props: { variant: 'issue' }, style: tone(t.bad, t.badSoft) },
        {
          props: { variant: 'duration' },
          style: { ...tone(t.ink, t.greySoft), fontFamily: fonts.mono, fontWeight: 500 },
        },
      ],
    },
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: {
          position: 'relative',
          transform: 'none',
          marginBottom: 5,
          fontSize: '0.75rem',
          fontWeight: 500,
          color: t.muted,
          whiteSpace: 'normal',
          '&.Mui-focused': { color: t.muted },
          '&.Mui-error': { color: t.bad },
        },
        asterisk: { color: t.bad },
      },
    },
    MuiOutlinedInput: {
      defaultProps: { notched: false },
      styleOverrides: {
        root: {
          minHeight: 36,
          fontSize: '0.8125rem',
          borderRadius: radius.control,
          backgroundColor: t.surface,
          transition: 'box-shadow .12s ease',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: t.line, top: 0 },
          '& .MuiOutlinedInput-notchedOutline legend': { display: 'none' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.faint },
          '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(15,118,110,.12)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.accent, borderWidth: 1 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: t.bad, borderWidth: 1 },
          '&.Mui-error': { boxShadow: '0 0 0 3px rgba(220,38,38,.14)' },
          '&.Mui-disabled': { backgroundColor: t.sunk, color: t.faint },
          // An attached list is open below (Select menu, or Autocomplete suggestions): join the two.
          '&:has(.MuiSelect-select[aria-expanded="true"]), .MuiAutocomplete-root.Mui-expanded &': {
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.accent },
          },
        },
        input: { paddingTop: 8, paddingBottom: 8, paddingInline: 10 },
        inputSizeSmall: { paddingTop: 6, paddingBottom: 6 },
        multiline: { paddingTop: 8, paddingBottom: 8 },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginLeft: 2, marginRight: 0, fontSize: '0.72rem', color: t.faint } },
    },
    MuiPopover: {
      styleOverrides: { paper: { border: `1px solid ${t.line}`, boxShadow: MENU_SHADOW } },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          minHeight: 34,
          '&:hover': { backgroundColor: t.accentSoft },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: t.accentSoft, color: t.accent, fontWeight: 600 },
        },
      },
    },
    // Suggestion lists hang off the input: attached to its bottom edge (or top edge when flipped up).
    MuiAutocomplete: {
      styleOverrides: {
        paper: ({ theme }) => ({
          marginTop: -1,
          border: `1px solid ${t.accent}`,
          borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
          boxShadow: MENU_SHADOW,
        }),
        popper: ({ theme }) => ({
          '&[data-popper-placement^="top"] .MuiAutocomplete-paper': {
            marginTop: 0,
            marginBottom: -1,
            borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
          },
        }),
        option: {
          fontSize: '0.8125rem',
          '&.Mui-focused': { backgroundColor: `${t.accentSoft} !important` },
        },
      },
    },
    MuiTextField: { defaultProps: { fullWidth: true } },
    // Select menus open attached below the field: same left edge and width, joined to its bottom border.
    MuiSelect: {
      defaultProps: {
        MenuProps: {
          anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
          transformOrigin: { vertical: 'top', horizontal: 'left' },
          marginThreshold: 8,
          slotProps: {
            paper: {
              sx: (theme) => ({
                mt: '-1px',
                border: `1px solid ${t.accent}`,
                borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
                maxHeight: 320,
              }),
            },
          },
        },
      },
    },
    // Segmented choice (AIMS `.radiobar`): bordered group, checked = teal with white text.
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 34,
          fontFamily: fonts.body,
          fontSize: '0.78rem',
          fontWeight: 500,
          textTransform: 'none',
          color: t.muted,
          borderColor: t.line,
          backgroundColor: t.surface,
          paddingInline: 12,
          '&:hover': { backgroundColor: t.accentSoft },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: t.accent, color: '#FFFFFF' },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40, borderBottom: `1px solid ${t.line}` },
        indicator: { backgroundColor: t.accent, height: 2 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 40,
          paddingInline: 14,
          fontSize: '0.8125rem',
          fontWeight: 500,
          textTransform: 'none',
          color: t.muted,
          '&.Mui-selected': { color: t.accent, fontWeight: 600 },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: { root: { '& .MuiTable-root': { borderCollapse: 'separate' } } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: t.line2, fontSize: '0.8125rem', padding: '9px 11px' },
        head: {
          ...monoLabel,
          backgroundColor: t.surface,
          color: t.ink,
          fontSize: '0.6875rem',
          padding: '11px 11px 9px',
          whiteSpace: 'nowrap',
          borderBottom: 'none',
          boxShadow: `inset 0 -1px 0 ${t.colRule}`,
        },
        footer: { backgroundColor: t.bg, fontWeight: 600, color: t.ink },
      },
    },
    MuiTableRow: {
      styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: '#FAFCFD' } } },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        root: { '&:hover': { color: t.accent }, '&.Mui-active': { color: t.accent } },
        icon: { fontSize: 14 },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { borderTop: `1px solid ${t.line}`, color: t.muted, fontSize: '0.78rem' },
        selectLabel: { fontSize: '0.78rem' },
        displayedRows: { fontSize: '0.78rem', fontFamily: fonts.mono },
        actions: {
          '& .MuiIconButton-root': { border: `1px solid ${t.line}`, borderRadius: 4, padding: 3, marginLeft: 4 },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 14, backgroundImage: 'none', boxShadow: '0 24px 60px rgba(16,21,28,.42)' },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)' },
        },
      },
    },
    // Dialog header: AIMS modal header — eyebrow + title on white, hairline below; body on the canvas colour.
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1rem',
          fontWeight: 700,
          padding: '14px 18px 12px',
          borderBottom: `1px solid ${t.line}`,
          marginBottom: 14,
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: { root: { borderTop: `1px solid ${t.line}`, padding: '10px 16px', gap: 6 } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundImage: 'none' } },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          backgroundColor: t.accent,
          color: '#FFFFFF',
          fontSize: '0.78rem',
          fontWeight: 500,
          borderRadius: radius.control,
          boxShadow: '0 6px 20px rgba(16,21,28,.22)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: radius.control, alignItems: 'center', fontSize: '0.78rem', border: '1px solid transparent' },
        standardSuccess: { backgroundColor: t.okSoft, color: t.ink, borderColor: '#BFDCCB', '& .MuiAlert-icon': { color: t.ok } },
        standardWarning: { backgroundColor: t.warnSoft, color: t.ink, borderColor: t.warn, '& .MuiAlert-icon': { color: t.warn } },
        standardError: { backgroundColor: t.badSoft, color: t.ink, borderColor: t.bad, '& .MuiAlert-icon': { color: t.bad } },
        standardInfo: { backgroundColor: t.surface, color: t.ink, borderColor: t.line, '& .MuiAlert-icon': { color: t.accent } },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: t.ink, fontSize: '0.72rem', borderRadius: radius.control, padding: '6px 9px' },
        arrow: { color: t.ink },
      },
    },
    MuiCheckbox: {
      styleOverrides: { root: { color: t.faint, '&.Mui-checked': { color: t.accent } } },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: t.accent, '& + .MuiSwitch-track': { backgroundColor: t.accent } } },
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { backgroundColor: t.accentSoft }, bar: { backgroundColor: t.accent } },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: t.railMuted,
          minWidth: 0,
          paddingInline: 4,
          '&.Mui-selected': { color: '#FFFFFF' },
        },
        label: {
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.66rem',
          '&.Mui-selected': { fontSize: '0.66rem' },
        },
      },
    },
  },
});
