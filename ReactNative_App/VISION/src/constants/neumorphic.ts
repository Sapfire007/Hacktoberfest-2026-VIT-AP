/**
 * VISION Design System — Neumorphic Style Utilities
 *
 * Provides cross-platform neumorphic shadow effects.
 * On iOS: uses native shadows.
 * On Android: uses elevation + overlay approach.
 * On Web: uses CSS box-shadow.
 */

import { Platform, ViewStyle } from 'react-native';
import { Colors } from './colors';

/** Base neumorphic surface background */
export const NEU_BG = Colors.neuBackground;

// ─── Shadow Generators ───────────────────────────────────────

/**
 * Raised / outset neumorphic surface — the standard card effect.
 * Creates the illusion of a soft, raised element on a flat surface.
 */
export function neuOutset(
  distance: number = 6,
  blur: number = 12,
  bg: string = Colors.neuSurface,
): ViewStyle {
  return Platform.select({
    ios: {
      backgroundColor: bg,
      shadowColor: Colors.neuDarkShadow,
      shadowOffset: { width: distance, height: distance },
      shadowOpacity: 0.25,
      shadowRadius: blur,
    },
    android: {
      backgroundColor: bg,
      elevation: distance,
    },
    default: {
      backgroundColor: bg,
      // @ts-ignore — web-only property
      boxShadow: `${distance}px ${distance}px ${blur}px ${Colors.neuDarkShadow}, -${distance}px -${distance}px ${blur}px ${Colors.neuLightShadow}`,
    },
  }) as ViewStyle;
}

/**
 * Inset / pressed neumorphic surface.
 * Creates the illusion of a pressed-in element (e.g., input fields, active buttons).
 */
export function neuInset(
  distance: number = 4,
  blur: number = 8,
  bg: string = Colors.neuSurface,
): ViewStyle {
  return Platform.select({
    ios: {
      backgroundColor: bg,
      shadowColor: Colors.neuDarkShadow,
      shadowOffset: { width: -distance / 2, height: -distance / 2 },
      shadowOpacity: 0.15,
      shadowRadius: blur / 2,
    },
    android: {
      backgroundColor: bg,
      elevation: 0,
      borderWidth: 1,
      borderColor: Colors.neuInsetLight,
    },
    default: {
      backgroundColor: bg,
      // @ts-ignore
      boxShadow: `inset ${distance}px ${distance}px ${blur}px ${Colors.neuDarkShadow}, inset -${distance}px -${distance}px ${blur}px ${Colors.neuLightShadow}`,
    },
  }) as ViewStyle;
}

/**
 * Flat neumorphic surface — blends with the background.
 */
export function neuFlat(bg: string = Colors.neuSurface): ViewStyle {
  return {
    backgroundColor: bg,
  };
}

/**
 * Dark neumorphic outset — for dark-themed screens (splash, etc.)
 */
export function neuDarkOutset(
  distance: number = 8,
  blur: number = 16,
  bg: string = Colors.neuDarkSurface,
): ViewStyle {
  return Platform.select({
    ios: {
      backgroundColor: bg,
      shadowColor: Colors.neuDarkDarkShadow,
      shadowOffset: { width: distance, height: distance },
      shadowOpacity: 0.5,
      shadowRadius: blur,
    },
    android: {
      backgroundColor: bg,
      elevation: distance,
    },
    default: {
      backgroundColor: bg,
      // @ts-ignore
      boxShadow: `${distance}px ${distance}px ${blur}px ${Colors.neuDarkDarkShadow}, -${distance}px -${distance}px ${blur}px ${Colors.neuDarkLightShadow}`,
    },
  }) as ViewStyle;
}

/**
 * Neumorphic button styles — provides pressed and released states.
 */
export const NeuButtonStyles = {
  released: (bg?: string) => neuOutset(4, 8, bg),
  pressed: (bg?: string) => neuInset(3, 6, bg),
};

// ─── Spacing Tokens (8px grid) ───────────────────────────────

export const Spacing = {
  /** 2px — extra extra small */
  '2xs': 2,
  /** 4px */
  xs: 4,
  /** 8px — base unit */
  sm: 8,
  /** 12px */
  md: 12,
  /** 16px — gutter-mobile */
  lg: 16,
  /** 20px */
  xl: 20,
  /** 24px — gutter-desktop */
  '2xl': 24,
  /** 32px */
  '3xl': 32,
  /** 40px */
  '4xl': 40,
  /** 48px — touch-target */
  '5xl': 48,
  /** 64px */
  '6xl': 64,
} as const;

// ─── Border Radius Tokens ────────────────────────────────────

export const Radius = {
  /** 4px */
  sm: 4,
  /** 8px — default */
  md: 8,
  /** 12px */
  lg: 12,
  /** 16px */
  xl: 16,
  /** 24px */
  '2xl': 24,
  /** 9999px — pill */
  full: 9999,
} as const;

// ─── Neumorphic Presets ──────────────────────────────────────

/** Pre-configured neumorphic styles for common components */
export const NeuPresets = {
  /** Standard raised card */
  card: {
    ...neuOutset(6, 12),
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  } as ViewStyle,

  /** Small raised element (chip, badge) */
  chip: {
    ...neuOutset(3, 6),
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  } as ViewStyle,

  /** Input field (inset) */
  input: {
    ...neuInset(4, 8),
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  } as ViewStyle,

  /** Large button */
  button: {
    ...neuOutset(4, 8),
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  } as ViewStyle,

  /** Bottom tab bar */
  tabBar: {
    ...neuOutset(4, 12),
    borderRadius: Radius['2xl'],
  } as ViewStyle,

  /** Dark card (for splash screen) */
  darkCard: {
    ...neuDarkOutset(8, 16),
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  } as ViewStyle,
} as const;
