// Single MUI theme from the SPEC tokens. CSS variables + `colorSchemeSelector: 'media'` make
// light/dark follow prefers-color-scheme. Custom palette entries: `gb` (every raw token),
// `rail`, `accent`, `sunk`. Custom variants: Button `exit`; Chip `inside`, `overstay`, `exited`,
// `pass`, `duration`, `pending`, `issue`; Typography `mono`, `eyebrow`, `display`.
import { createTheme } from '@mui/material/styles';
import { darkTokens, DESKTOP_MIN, fonts, lightTokens, radius } from './tokens';
function paletteFrom(t, mode) {
  return {
    mode,
    primary: { main: t.accent, contrastText: t.accentInk },
    secondary: { main: t.ink, contrastText: t.surface },
    success: { main: t.ok, contrastText: '#FFFFFF' },
    warning: { main: t.warn, contrastText: '#FFFFFF' },
    error: { main: t.bad, contrastText: '#FFFFFF' },
    info: { main: t.muted, contrastText: t.surface },
    background: { default: t.bg, paper: t.surface },
    text: { primary: t.ink, secondary: t.muted },
    divider: t.line,
    gb: t,
    rail: { main: t.rail, contrastText: t.railInk, muted: t.railMuted },
    accent: { main: t.accent, contrastText: t.accentInk, soft: t.accentSoft },
    sunk: t.sunk,
  };
}
const display = {
  fontFamily: fonts.display,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  lineHeight: 1.05,
};
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media', cssVarPrefix: 'gb' },
  colorSchemes: {
    light: { palette: paletteFrom(lightTokens, 'light') },
    dark: { palette: paletteFrom(darkTokens, 'dark') },
  },
  breakpoints: { values: { xs: 0, sm: 600, md: DESKTOP_MIN, lg: 1200, xl: 1536 } },
  shape: { borderRadius: radius.control },
  typography: {
    fontFamily: fonts.body,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: { ...display, fontSize: '2.1rem' },
    h2: { ...display, fontSize: '1.6rem' },
    h3: { ...display, fontSize: '1.25rem' },
    h4: { ...display, fontSize: '1.1rem', letterSpacing: '0.04em' },
    h5: { ...display, fontSize: '1rem', letterSpacing: '0.05em' },
    h6: { ...display, fontSize: '0.9rem', letterSpacing: '0.06em' },
    body1: { fontSize: '0.975rem' },
    body2: { fontSize: '0.875rem' },
    button: {
      fontFamily: fonts.display,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontSize: '1rem',
    },
    mono: { fontFamily: fonts.mono, fontWeight: 500, fontSize: '0.875rem', letterSpacing: 0 },
    eyebrow: {
      fontFamily: fonts.display,
      fontWeight: 600,
      fontSize: '0.85rem',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      lineHeight: 1.3,
    },
    display: { fontFamily: fonts.display, fontWeight: 700, fontSize: '2.4rem', lineHeight: 1 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        body: { backgroundColor: theme.vars.palette.gb.bg, color: theme.vars.palette.gb.ink },
        '::selection': { background: theme.vars.palette.gb.accentSoft },
      }),
    },
    MuiTypography: {
      defaultProps: {
        variantMapping: { mono: 'span', eyebrow: 'div', display: 'div' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({ backgroundImage: 'none', backgroundColor: theme.vars.palette.gb.surface }),
        rounded: { borderRadius: radius.panel },
        outlined: ({ theme }) => ({ borderColor: theme.vars.palette.gb.line }),
      },
    },
    MuiButtonBase: { defaultProps: { disableRipple: false } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: radius.control, paddingInline: 18, whiteSpace: 'nowrap' },
        sizeSmall: { minHeight: 34, paddingInline: 12, fontSize: '0.85rem' },
        sizeLarge: { minHeight: 52, fontSize: '1.1rem', paddingInline: 24 },
        outlined: ({ theme }) => ({
          borderColor: theme.vars.palette.gb.line,
          color: theme.vars.palette.gb.ink,
          backgroundColor: theme.vars.palette.gb.surface,
          '&:hover': { borderColor: theme.vars.palette.gb.muted, backgroundColor: theme.vars.palette.gb.sunk },
        }),
        text: ({ theme }) => ({ color: theme.vars.palette.gb.ink }),
        containedPrimary: ({ theme }) => ({
          backgroundColor: theme.vars.palette.gb.accent,
          color: theme.vars.palette.gb.accentInk,
          '&:hover': { backgroundColor: theme.vars.palette.gb.accent, filter: 'brightness(0.94)' },
        }),
      },
      variants: [
        {
          props: { variant: 'exit' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.ink,
            color: theme.vars.palette.gb.surface,
            '&:hover': { backgroundColor: theme.vars.palette.gb.ink, opacity: 0.88 },
            '&.Mui-disabled': { opacity: 0.45, color: theme.vars.palette.gb.surface },
          }),
        },
      ],
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: radius.control } },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: radius.chip, fontWeight: 600, height: 26 },
        label: { paddingInline: 10 },
      },
      variants: [
        {
          props: { variant: 'inside' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.okSoft,
            color: theme.vars.palette.gb.ok,
          }),
        },
        {
          props: { variant: 'overstay' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.warnSoft,
            color: theme.vars.palette.gb.warn,
          }),
        },
        {
          props: { variant: 'exited' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.sunk,
            color: theme.vars.palette.gb.muted,
            border: `1px solid ${theme.vars.palette.gb.line}`,
          }),
        },
        {
          props: { variant: 'pass' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.accent,
            color: theme.vars.palette.gb.accentInk,
            fontFamily: fonts.mono,
            fontWeight: 500,
            height: 22,
            fontSize: '0.78rem',
            '& .MuiChip-label': { paddingInline: 8 },
          }),
        },
        {
          props: { variant: 'pending' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.accentSoft,
            color: theme.vars.palette.gb.ink,
            border: `1px solid ${theme.vars.palette.gb.accent}`,
          }),
        },
        {
          props: { variant: 'issue' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.badSoft,
            color: theme.vars.palette.gb.bad,
          }),
        },
        {
          props: { variant: 'duration' },
          style: ({ theme }) => ({
            backgroundColor: theme.vars.palette.gb.sunk,
            color: theme.vars.palette.gb.ink,
            fontFamily: fonts.mono,
            fontWeight: 500,
            border: `1px solid ${theme.vars.palette.gb.line}`,
          }),
        },
      ],
    },
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: ({ theme }) => ({
          position: 'relative',
          transform: 'none',
          marginBottom: 6,
          fontSize: '0.8rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: theme.vars.palette.gb.muted,
          whiteSpace: 'normal',
          '&.Mui-focused': { color: theme.vars.palette.gb.ink },
          '&.Mui-error': { color: theme.vars.palette.gb.bad },
        }),
        asterisk: ({ theme }) => ({ color: theme.vars.palette.gb.bad }),
      },
    },
    MuiOutlinedInput: {
      defaultProps: { notched: false },
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 44,
          borderRadius: radius.control,
          backgroundColor: theme.vars.palette.gb.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.gb.line, top: 0 },
          '& .MuiOutlinedInput-notchedOutline legend': { display: 'none' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.gb.muted },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.vars.palette.gb.accent,
            borderWidth: 2,
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.gb.bad, borderWidth: 2 },
          '&.Mui-error': { backgroundColor: theme.vars.palette.gb.badSoft },
          // An attached list is open below (Select menu, or Autocomplete suggestions): join the two.
          '&:has(.MuiSelect-select[aria-expanded="true"]), .MuiAutocomplete-root.Mui-expanded &': {
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.gb.accent },
          },
        }),
        input: { paddingTop: 10, paddingBottom: 10 },
        multiline: { paddingTop: 10, paddingBottom: 10 },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginLeft: 2, marginRight: 0, fontWeight: 500 } },
    },
    MuiPopover: {
      styleOverrides: {
        paper: ({ theme }) => ({
          border: `1px solid ${theme.vars.palette.gb.line}`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }),
      },
    },
    // Suggestion lists hang off the input: attached to its bottom edge (or top edge when flipped up).
    MuiAutocomplete: {
      styleOverrides: {
        paper: ({ theme }) => ({
          marginTop: -1,
          border: `1px solid ${theme.vars.palette.gb.accent}`,
          borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }),
        popper: ({ theme }) => ({
          '&[data-popper-placement^="top"] .MuiAutocomplete-paper': {
            marginTop: 0,
            marginBottom: -1,
            borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
          },
        }),
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
                border: `1px solid ${theme.vars.palette.gb.accent}`,
                borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
                maxHeight: 320,
              }),
            },
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 40,
          fontFamily: fonts.display,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: theme.vars.palette.gb.muted,
          borderColor: theme.vars.palette.gb.line,
          backgroundColor: theme.vars.palette.gb.surface,
          paddingInline: 14,
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: theme.vars.palette.gb.ink,
            color: theme.vars.palette.gb.surface,
          },
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({ borderColor: theme.vars.palette.gb.line, paddingBlock: 10 }),
        head: ({ theme }) => ({
          backgroundColor: theme.vars.palette.gb.sunk,
          color: theme.vars.palette.gb.muted,
          fontFamily: fonts.display,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: '0.78rem',
          whiteSpace: 'nowrap',
        }),
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: radius.panel + 4, backgroundImage: 'none' } },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.vars.palette.gb.ink,
          color: theme.vars.palette.gb.surface,
          fontWeight: 600,
          borderRadius: radius.control,
        }),
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: radius.control, alignItems: 'center' } },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: ({ theme }) => ({ '&.Mui-checked': { color: theme.vars.palette.gb.ok } }),
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.vars.palette.gb.railMuted,
          minWidth: 0,
          paddingInline: 4,
          '&.Mui-selected': { color: theme.vars.palette.gb.railInk },
        }),
        label: {
          fontFamily: fonts.display,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.72rem',
          '&.Mui-selected': { fontSize: '0.72rem' },
        },
      },
    },
  },
});
