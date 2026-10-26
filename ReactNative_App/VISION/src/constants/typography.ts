/**
 * VISION Design System — Typography Tokens
 *
 * Based on Stitch "College Portal Design System" typography scale.
 * Font: Inter (humanist sans-serif per Design.md §3).
 */

import { Platform, TextStyle } from 'react-native';

const fontFamily = Platform.select({
  ios: 'Inter',
  android: 'Inter',
  default: 'Inter, system-ui, -apple-system, sans-serif',
});

export const Typography = {
  /** 40px / 700 — Large display headers */
  headlineXl: {
    fontFamily,
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 48,
    letterSpacing: -0.8,
  } as TextStyle,

  /** 32px / 700 — Section headers */
  headlineLg: {
    fontFamily,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
  } as TextStyle,

  /** 24px / 700 — Mobile headline */
  headlineLgMobile: {
    fontFamily,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  } as TextStyle,

  /** 24px / 600 — Subheaders */
  headlineMd: {
    fontFamily,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  } as TextStyle,

  /** 20px / 600 — Card titles */
  headlineSm: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  } as TextStyle,

  /** 18px / 400 — Large body text */
  bodyLg: {
    fontFamily,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 28,
  } as TextStyle,

  /** 16px / 400 — Standard body text */
  bodyMd: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } as TextStyle,

  /** 14px / 400 — Small body text */
  bodySm: {
    fontFamily,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,

  /** 16px / 600 — Tabular/numeric data (timestamps, plate numbers) */
  tabularNumeric: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    fontVariant: ['tabular-nums' as const],
  } as TextStyle,

  /** 12px / 700 — Uppercase label */
  labelCaps: {
    fontFamily,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  } as TextStyle,

  /** 13px / 600 — Status badge text */
  statusBadge: {
    fontFamily,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  } as TextStyle,

  /** 16px / 600 — Button text */
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  /** 14px / 600 — Small button text */
  buttonSm: {
    fontFamily,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  } as TextStyle,

  /** 12px / 500 — Caption */
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  } as TextStyle,

  /** 10px / 600 — Tiny label */
  tiny: {
    fontFamily,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: 0.4,
  } as TextStyle,

  // ─── Aliases (teammate compat) ──────────────────────────────
  /** Alias for headlineXl */
  h1: {
    fontFamily,
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 48,
    letterSpacing: -0.8,
  } as TextStyle,

  /** Alias for headlineLg */
  h2: {
    fontFamily,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
  } as TextStyle,

  /** Alias for headlineSm */
  h3: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  } as TextStyle,

  /** Alias for bodyMd */
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } as TextStyle,
} as const;
