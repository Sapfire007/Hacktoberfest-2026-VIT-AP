/**
 * VisionEyeLogo — Minimalist & Simple Vector Eye Logo
 * 
 * Clean, elegant, corporate-modernist line-art eye emblem matching the VISION brand identity.
 */

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';

interface VisionEyeLogoProps {
  size?: number;
  color?: string;
  accentColor?: string;
}

export function VisionEyeLogo({
  size = 32,
  color = Colors.navy900,
  accentColor = Colors.orange600,
}: VisionEyeLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Outer Minimalist Eye Arc */}
      <Path
        d="M 6 24 C 14 13, 34 13, 42 24 C 34 35, 14 35, 6 24 Z"
        stroke={color}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner Iris Ring */}
      <Circle
        cx="24"
        cy="24"
        r="7.5"
        stroke={color}
        strokeWidth="2.4"
      />

      {/* Pupil Core Accent */}
      <Circle
        cx="24"
        cy="24"
        r="3.5"
        fill={accentColor}
      />
    </Svg>
  );
}
