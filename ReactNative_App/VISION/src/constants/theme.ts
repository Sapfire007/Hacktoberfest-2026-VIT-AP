/**
 * VISION Design System — Theme Configuration
 *
 * Central theme export combining colors, typography, neumorphic styles,
 * and spacing into a unified design system.
 */

import { Platform } from 'react-native';
import { Colors, StatusColors, CategoryColors } from './colors';
import { Typography } from './typography';
import { Spacing, Radius, NeuPresets, neuOutset, neuInset, neuFlat, neuDarkOutset } from './neumorphic';

export { Colors, StatusColors, CategoryColors } from './colors';
export { Typography } from './typography';
export {
  Spacing,
  Radius,
  NeuPresets,
  neuOutset,
  neuInset,
  neuFlat,
  neuDarkOutset,
  NeuButtonStyles,
  NEU_BG,
} from './neumorphic';

/** App-wide theme object */
export const Theme = {
  colors: Colors,
  status: StatusColors,
  category: CategoryColors,
  typography: Typography,
  spacing: Spacing,
  radius: Radius,
  presets: NeuPresets,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'Inter',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Inter',
    serif: 'serif',
    rounded: 'Inter',
    mono: 'monospace',
  },
  web: {
    sans: 'Inter, system-ui, -apple-system, sans-serif',
    serif: 'Georgia, Times New Roman, serif',
    rounded: 'Inter, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
});

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
