/**
 * VISION Design System — Color Tokens
 *
 * Based on Design.md §3 and Stitch "College Portal Design System" palette.
 * Adapted for Neumorphism theme.
 */

export const Colors = {
  // ─── Brand / Primary ───────────────────────────────────────
  navy900: '#0B2545',
  navy800: '#13325A',
  navy700: '#1B3F6F',
  navy600: '#234D84',
  // Tints used by the visit request form; referenced before they existed, which left
  // those borders and backgrounds unset.
  navy100: '#DCE4F0',
  navy50: '#EEF2F8',

  // ─── Accent ────────────────────────────────────────────────
  orange600: '#E8720C',
  orange500: '#F28D35',
  orange400: '#F5A55A',
  orange100: '#FFF0E0',
  orange700: '#C25E08',

  // ─── Semantic — Status ─────────────────────────────────────
  green600: '#1E8E3E',
  green100: '#E6F4EA',
  red700: '#B3261E',
  red600: '#D93025',
  red100: '#FCE8E6',
  red50: '#FEF2F2',
  blue500: '#2F6FED',
  blue100: '#E8F0FE',
  purple500: '#7B4FE0',
  purple100: '#F3EFFF',

  // ─── Neutral Scale ─────────────────────────────────────────
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // ─── Neumorphism Surface ───────────────────────────────────
  neuBackground: '#E4E8EC',
  neuSurface: '#E4E8EC',
  neuLightShadow: '#FFFFFF',
  neuDarkShadow: '#B8BCC0',
  neuInsetLight: '#D1D5D9',
  neuInsetDark: '#F7FBFF',

  // ─── Dark Neumorphism (for splash/dark screens) ────────────
  neuDarkBackground: '#0B2545',
  neuDarkSurface: '#0F2D52',
  neuDarkLightShadow: '#10335E',
  neuDarkDarkShadow: '#061A30',

  // ─── Aliases (teammate compat) ──────────────────────────────
  primary: '#0B2545',
  yellow500: '#F5A623',
  green500: '#1E8E3E',

  // ─── Constant ──────────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

/**
 * Status color mapping for visit request lifecycle.
 * Maps to Design.md §3 status chip colors.
 */
export const StatusColors = {
  draft: { bg: Colors.gray100, text: Colors.gray600, label: 'Draft' },
  submitted: { bg: Colors.gray200, text: Colors.gray700, label: 'Submitted' },
  under_review: { bg: Colors.blue100, text: Colors.blue500, label: 'Under Review' },
  approved: { bg: Colors.green100, text: Colors.green600, label: 'Approved' },
  rejected: { bg: Colors.red100, text: Colors.red600, label: 'Rejected' },
  cancelled: { bg: Colors.gray100, text: Colors.gray500, label: 'Cancelled' },
  permit_active: { bg: Colors.green100, text: Colors.green600, label: 'Active' },
  permit_used: { bg: Colors.purple100, text: Colors.purple500, label: 'Used' },
  permit_expired: { bg: Colors.gray200, text: Colors.gray500, label: 'Expired' },
  permit_revoked: { bg: Colors.red100, text: Colors.red600, label: 'Revoked' },
  pending: { bg: Colors.orange100, text: Colors.orange600, label: 'Pending' },
} as const;

/**
 * Category badge colors for visitor subtypes.
 */
export const CategoryColors = {
  parent: { bg: '#EDE9FE', text: '#6D28D9', label: 'PARENT' },
  vendor: { bg: Colors.navy900, text: Colors.white, label: 'VENDOR' },
  guest_faculty: { bg: Colors.orange100, text: Colors.orange600, label: 'GUEST LECTURER' },
  alumni: { bg: Colors.blue100, text: Colors.blue500, label: 'ALUMNI' },
  general: { bg: Colors.gray200, text: Colors.gray700, label: 'VISITOR' },
  // An enrolled VIT-AP student, shown on requests they sponsored for a parent.
  student: { bg: Colors.green100, text: Colors.green600, label: 'STUDENT' },
  // A student visiting from another institution — a visitor subtype, not a role
  // (VISION.md section 3.3). Distinct badge so a guard can tell the two apart at a glance.
  external_student: { bg: Colors.blue100, text: Colors.blue500, label: 'EXT. STUDENT' },
} as const;

export type StatusKey = keyof typeof StatusColors;
export type CategoryKey = keyof typeof CategoryColors;
