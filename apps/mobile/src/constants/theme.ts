import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#072254',            // Sanad Deep Medical Navy
    textSecondary: '#4A6588',   // Sanad Medical Slate
    textMuted: '#829AB8',       // Sanad Slate Muted
    background: '#F8FAFD',      // Sanad Soft Medical Canvas
    card: '#FFFFFF',
    border: '#E2ECF8',          // Sanad Light Border
    borderFocus: '#BCD8FE',     // Sanad Border Focus
    primary: '#0066EE',         // Sanad Sapphire / Royal Medical Blue
    primaryLight: '#EBF3FF',    // Sanad Soft Blue Pill
    primaryDark: '#072254',     // Sanad Deep Navy
    accent: '#2589FF',          // Sanad Azure / Sky Accent
    emergency: '#D92D20',       // Sanad Urgent Ruby Red
    emergencyLight: '#FEF3F2',  // Sanad Urgent Light Tint
    emergencyBorder: '#FECDCA', // Sanad Urgent Light Border
    success: '#059669',         // Emerald 600
    successLight: '#D1FAE5',
    warning: '#B54708',         // Amber 600
    warningLight: '#FEF3C7',
    backgroundElement: '#F0F6FF', // Soft Sapphire Fill
    backgroundSelected: '#EBF3FF',
  },
  dark: {
    text: '#F0F4FA',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    background: '#07152E',      // Deep Medical Navy Dark
    card: '#0D2144',
    border: '#1B3560',
    borderFocus: '#2589FF',
    primary: '#2589FF',
    primaryLight: '#0E2A54',
    primaryDark: '#0066EE',
    accent: '#60A5FA',
    emergency: '#F87171',
    emergencyLight: '#450A0A',
    emergencyBorder: '#7F1D1D',
    success: '#34D399',
    successLight: '#064E3B',
    warning: '#FBBF24',
    warningLight: '#451A03',
    backgroundElement: '#122B54',
    backgroundSelected: '#183668',
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
