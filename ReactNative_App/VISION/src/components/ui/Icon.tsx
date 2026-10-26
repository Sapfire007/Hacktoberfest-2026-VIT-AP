/**
 * Icon Component
 * 
 * Centralized SVG icon component for the VISION app.
 * Replaces emoji icons with SVG icons for better consistency and customization.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Path, SvgProps } from 'react-native-svg';

// Icon name type for type safety
export type IconName =
  // Navigation
  | 'home'
  | 'profile'
  | 'visit-request'
  | 'multiple-users'
  | 'family'
  // Actions
  | 'search'
  | 'camera'
  | 'gallery'
  | 'mobile'
  // Vehicles
  | 'car'
  | 'motorbike'
  | 'truck'
  // Status
  | 'success'
  | 'error-or-rejected'
  | 'warning'
  | 'alert'
  | 'info-square-rounded'
  // Security
  | 'lock-secure'
  | 'lock-features'
  | 'university'
  | 'entrance'
  | 'exit'
  | 'shield-check'
  | 'face-id'
  // Roles
  | 'student'
  | 'teacher'
  | 'visitor'
  // Faculty specific
  | 'inbox'
  | 'advisees'
  // System
  | 'notification-bell'
  | 'lightning'
  | 'lightbulb'
  | 'cloud'
  | 'stopwatch'
  | 'hourglass'
  | 'settings'
  | 'calendar'
  | 'clock'
  // Documents
  | 'mail-question'
  | 'file-cabinet'
  | 'target-arrow';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/**
 * Icon component that renders SVG icons with proper sizing and colors
 */
export const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 24, 
  color = 'currentColor',
  style 
}) => {
  const IconSvg = ICON_MAP[name];
  
  if (!IconSvg) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  return <IconSvg width={size} height={size} color={color} style={style} />;
};

// SVG Icon Components
const HomeIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M19 8.71l-5.333 -4.148a2.666 2.666 0 0 0 -3.274 0l-5.334 4.148a2.665 2.665 0 0 0 -1.029 2.105v7.2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-7.2c0 -.823 -.38 -1.6 -1.03 -2.105" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M16 15c-2.21 1.333 -5.792 1.333 -8 0" />
  </Svg>
);

const ProfileIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
  </Svg>
);

const VisitRequestIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 16h6" />
  </Svg>
);

const MultipleUsersIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </Svg>
);

const FamilyIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 512 512" fill={props.color} {...props}>
    <Path d="M78.641,118.933c22.88,0,41.416-18.551,41.416-41.414c0-22.887-18.536-41.423-41.416-41.423 c-22.887,0-41.422,18.536-41.422,41.423C37.218,100.382,55.754,118.933,78.641,118.933z" />
    <Path d="M255.706,228.73v0.062c0.101,0,0.194-0.031,0.294-0.031c0.101,0,0.194,0.031,0.294,0.031v-0.062 c15.562-0.317,28.082-12.976,28.082-28.601c0-15.648-12.52-28.299-28.082-28.616v-0.063c-0.101,0-0.194,0.031-0.294,0.031 c-0.1,0-0.193-0.031-0.294-0.031v0.063c-15.563,0.317-28.082,12.968-28.082,28.616C227.623,215.754,240.143,228.413,255.706,228.73 z" />
    <Path d="M433.359,118.933c22.887,0,41.423-18.551,41.423-41.414c0-22.887-18.536-41.423-41.423-41.423 c-22.88,0-41.416,18.536-41.416,41.423C391.944,100.382,410.48,118.933,433.359,118.933z" />
    <Path d="M470.097,138.553h-36.312h-18.404c-21.106,0-40.432,11.831-50.033,30.622l-33.494,97.967 c-1.154,2.246-3.298,3.84-5.792,4.282c-2.493,0.442-5.048-0.309-6.914-2.036l-20.836-18.04c-6.233-5.769-14.408-8.973-22.902-8.973 H256h-19.41c-8.494,0-16.669,3.204-22.902,8.973l-20.835,18.04c-1.866,1.727-4.421,2.478-6.914,2.036 c-2.492-0.442-4.637-2.036-5.791-4.282l-33.495-97.967c-9.6-18.791-28.926-30.622-50.032-30.622H78.215H41.902 C21.834,138.553,0,160.387,0,180.464v139.211c0,10.034,8.13,18.171,18.164,18.171c4.939,0,0,0,12.682,0l6.906,118.725 c0,10.676,8.664,19.332,19.34,19.332c4.506,0,12.814,0,21.122,0c8.308,0,16.616,0,21.122,0c10.676,0,19.34-8.656,19.34-19.332 l6.906-118.725l-0.085-84.766c0-1.339,0.914-2.493,2.222-2.818c1.309-0.31,2.648,0.309,3.26,1.502l26.572,65.401 c3.206,6.256,9.152,10.654,16.074,11.885c6.922,1.231,14.022-0.844,19.186-5.613l25.426-18.729 c0.852-0.782,2.083-0.984,3.136-0.542c1.061,0.473,1.743,1.518,1.743,2.663l0.093,73.508l4.777,82.187 c0,7.387,6.001,13.379,13.395,13.379c3.113,0,8.865,0,14.618,0c5.753,0,11.506,0,14.618,0c7.394,0,13.394-5.992,13.394-13.379 l4.778-82.187l0.093-73.508c0-1.146,0.681-2.19,1.742-2.663c1.053-0.442,2.284-0.24,3.136,0.542l25.427,18.729 c5.164,4.769,12.264,6.844,19.186,5.613c6.922-1.231,12.868-5.629,16.073-11.885l26.573-65.401 c0.611-1.192,1.951-1.812,3.259-1.502c1.309,0.325,2.222,1.478,2.222,2.818l-0.085,84.766l6.906,118.725 c0,10.676,8.664,19.332,19.341,19.332c4.507,0,12.814,0,21.122,0c8.308,0,16.616,0,21.121,0c10.677,0,19.342-8.656,19.342-19.332 l6.906-118.725c12.682,0,7.742,0,12.682,0c10.034,0,18.164-8.137,18.164-18.171V180.464 C512,160.387,490.166,138.553,470.097,138.553z" />
  </Svg>
);

const SearchIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6 -6" />
  </Svg>
);

const CameraIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
  </Svg>
);

const GalleryIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 8h.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
  </Svg>
);

const MobileIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M11 4h2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 17v.01" />
  </Svg>
);

const CarIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 17a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 17a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5" />
  </Svg>
);

const MotorbikeIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M19 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M7.5 14h5l4 -4h-10.5m1.5 4l4 -4" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M13 6h2l1.5 3l2 4" />
  </Svg>
);

const TruckIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
  </Svg>
);

const SuccessIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2l4 -4" />
  </Svg>
);

const ErrorIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10 10l4 4m0 -4l-4 4" />
  </Svg>
);

const WarningIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 16h.01" />
  </Svg>
);

const AlertIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 8v4" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 16h.01" />
  </Svg>
);

const InfoIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 9h.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M11 12h1v4h1" />
  </Svg>
);

const LockSecureIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M8 11v-4a4 4 0 1 1 8 0v4" />
  </Svg>
);

const LockFeaturesIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M8 11v-4a4 4 0 1 1 8 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 16h.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 16h.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 16h.01" />
  </Svg>
);

const UniversityIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M22 9l-10 -4l-10 4l10 4l10 -4v6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4" />
  </Svg>
);

const EntranceIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M14 12v.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 21v-16a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v16" />
  </Svg>
);

const ExitIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M13 12v.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M14 7h7m-3 -3l3 3l-3 3" />
  </Svg>
);

const ShieldCheckIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2l4 -4" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
  </Svg>
);

const NotificationBellIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 17v1a3 3 0 0 0 6 0v-1" />
  </Svg>
);

const LightningIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" />
  </Svg>
);

const LightbulbIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9.7 17l4.6 0" />
  </Svg>
);

const CloudIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" />
  </Svg>
);

const StopwatchIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5 13a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 10v3l2 2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 4h6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 4v2" />
  </Svg>
);

const HourglassIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6.5 7h11" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6.5 17h11" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1z" />
  </Svg>
);

const SettingsIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
  </Svg>
);

const MailIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 19h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v4.5" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6l9 -6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M19 22v.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" />
  </Svg>
);

const FileCabinetIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 0 0 1 1h4" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 15h6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12.5 15v6" />
  </Svg>
);

const TargetArrowIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 7a5 5 0 1 0 5 5" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M13 3.055a9 9 0 1 0 7.941 7.945" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 6v3h3l3 -3h-3v-3z" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 9l-3 3" />
  </Svg>
);

const StudentIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 256 256" fill={props.color} {...props}>
    <Path d="M226.53,56.41l-96-32a8,8,0,0,0-5.06,0l-96,32A8,8,0,0,0,24,64v80a8,8,0,0,0,16,0V75.1L73.59,86.29a64,64,0,0,0,20.65,88.05c-18,7.06-33.56,19.83-44.94,37.29a8,8,0,1,0,13.4,8.74C77.77,197.25,101.57,184,128,184s50.23,13.25,65.3,36.37a8,8,0,0,0,13.4-8.74c-11.38-17.46-27-30.23-44.94-37.29a64,64,0,0,0,20.65-88l44.12-14.7a8,8,0,0,0,0-15.18ZM176,120A48,48,0,1,1,89.35,91.55l36.12,12a8,8,0,0,0,5.06,0l36.12-12A47.89,47.89,0,0,1,176,120ZM128,87.57,57.3,64,128,40.43,198.7,64Z" />
  </Svg>
);

const TeacherIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 256 256" fill={props.color} {...props}>
    <Path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H53.39a8,8,0,0,0,7.23-4.57,48,48,0,0,1,86.76,0,8,8,0,0,0,7.23,4.57H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM80,144a24,24,0,1,1,24,24A24,24,0,0,1,80,144Zm136,56H159.43a64.39,64.39,0,0,0-28.83-26.16,40,40,0,1,0-53.2,0A64.39,64.39,0,0,0,48.57,200H40V56H216ZM56,96V80a8,8,0,0,1,8-8H192a8,8,0,0,1,8,8v96a8,8,0,0,1-8,8H176a8,8,0,0,1,0-16h8V88H72v8a8,8,0,0,1-16,0Z" />
  </Svg>
);

const VisitorIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 256 256" fill={props.color} {...props}>
    <Path d="M104,88v96a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Zm24-8a8,8,0,0,0-8,8v96a8,8,0,0,0,16,0V88A8,8,0,0,0,128,80Zm32,0a8,8,0,0,0-8,8v96a8,8,0,0,0,16,0V88A8,8,0,0,0,160,80Zm48-16V208a16,16,0,0,1-16,16H176v16a8,8,0,0,1-16,0V224H96v16a8,8,0,0,1-16,0V224H64a16,16,0,0,1-16-16V64A16,16,0,0,1,64,48H88V24A24,24,0,0,1,112,0h32a24,24,0,0,1,24,24V48h24A16,16,0,0,1,208,64ZM104,48h48V24a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8Zm88,160V64H64V208H192Z" />
  </Svg>
);

const FaceIdIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M4 8v-2a2 2 0 0 1 2 -2h2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M16 4h2a2 2 0 0 1 2 2v2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M16 20h2a2 2 0 0 0 2 -2v-2" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 10h.01" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9.5 15a3.5 3.5 0 0 0 5 0" />
  </Svg>
);

const CalendarIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 256 256" fill={props.color} {...props}>
    <Path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-96-88v64a8,8,0,0,1-16,0V132.94l-4.42,2.22a8,8,0,0,1-7.16-14.32l16-8A8,8,0,0,1,112,120Zm59.16,30.45L152,176h16a8,8,0,0,1,0,16H136a8,8,0,0,1-6.4-12.8l28.78-38.37A8,8,0,1,0,145.07,132a8,8,0,1,1-13.85-8A24,24,0,0,1,176,136,23.76,23.76,0,0,1,171.16,150.45Z" />
  </Svg>
);

const ClockIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
  </Svg>
);

const InboxIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M22 12 16 12 14 15 10 15 8 12 2 12" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Svg>
);

const AdviseesIcon: React.FC<SvgProps> = (props) => (
  <Svg viewBox="0 0 24 24" fill="none" {...props}>
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M22 9l-10 -4l-10 4l10 4l10 -4v6" />
    <Path stroke={props.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4" />
  </Svg>
);

// Icon mapping
const ICON_MAP: Record<IconName, React.FC<SvgProps>> = {
  home: HomeIcon,
  profile: ProfileIcon,
  'visit-request': VisitRequestIcon,
  'multiple-users': MultipleUsersIcon,
  family: FamilyIcon,
  search: SearchIcon,
  camera: CameraIcon,
  gallery: GalleryIcon,
  mobile: MobileIcon,
  car: CarIcon,
  motorbike: MotorbikeIcon,
  truck: TruckIcon,
  success: SuccessIcon,
  'error-or-rejected': ErrorIcon,
  warning: WarningIcon,
  alert: AlertIcon,
  'info-square-rounded': InfoIcon,
  'lock-secure': LockSecureIcon,
  'lock-features': LockFeaturesIcon,
  university: UniversityIcon,
  entrance: EntranceIcon,
  exit: ExitIcon,
  'shield-check': ShieldCheckIcon,
  'notification-bell': NotificationBellIcon,
  lightning: LightningIcon,
  lightbulb: LightbulbIcon,
  cloud: CloudIcon,
  stopwatch: StopwatchIcon,
  hourglass: HourglassIcon,
  settings: SettingsIcon,
  'mail-question': MailIcon,
  'file-cabinet': FileCabinetIcon,
  'target-arrow': TargetArrowIcon,
  student: StudentIcon,
  teacher: TeacherIcon,
  visitor: VisitorIcon,
  'face-id': FaceIdIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  inbox: InboxIcon,
  advisees: AdviseesIcon,
};

export default Icon;
