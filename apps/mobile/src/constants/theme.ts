import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',            // Slate 900
    textSecondary: '#64748B',   // Slate 500
    textMuted: '#94A3B8',       // Slate 400
    background: '#F8FAFC',      // Slate 50
    card: '#FFFFFF',
    border: '#E2E8F0',          // Slate 200
    primary: '#0D9488',         // Teal 600 - Calming clinical accent
    primaryLight: '#CCFBF1',    // Teal 100
    primaryDark: '#115E59',     // Teal 800
    accent: '#0284C7',          // Sky 600
    emergency: '#E11D48',       // Rose 600 - Urgent & Safety
    emergencyLight: '#FFE4E6',  // Rose 100
    success: '#059669',         // Emerald 600
    successLight: '#D1FAE5',
    warning: '#D97706',         // Amber 600
    warningLight: '#FEF3C7',
    backgroundElement: '#F1F5F9', // Slate 100
    backgroundSelected: '#E2E8F0',
  },
  dark: {
    text: '#F8FAFC',            // Slate 50
    textSecondary: '#94A3B8',   // Slate 400
    textMuted: '#64748B',       // Slate 500
    background: '#0B0F17',      // Deep slate/neutral
    card: '#151D2A',
    border: '#1E293B',          // Slate 800
    primary: '#14B8A6',         // Teal 500
    primaryLight: '#134E4A',    // Teal 900
    primaryDark: '#0F766E',
    accent: '#38BDF8',
    emergency: '#FB7185',       // Rose 400
    emergencyLight: '#4C0519',  // Rose 950
    success: '#34D399',
    successLight: '#064E3B',
    warning: '#FBBF24',
    warningLight: '#451A03',
    backgroundElement: '#1E293B',
    backgroundSelected: '#334155',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    rounded: 'System',
    mono: 'Menlo',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif-medium',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, Cambria, serif',
    rounded: 'system-ui, sans-serif',
    mono: 'ui-monospace, monospace',
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const TouchTarget = {
  min: 48, // 48px minimum touch area for mobile accessibility & easy thumb tap
};
