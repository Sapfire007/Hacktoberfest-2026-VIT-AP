/**
 * Under Construction Illustration Component
 * Professional construction-themed SVG for "Coming Soon" screens
 */

import React from 'react';
import Svg, { Rect, Circle, Line, Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';

interface UnderConstructionProps {
  width?: number;
  height?: number;
}

export function UnderConstruction({ width = 320, height = 240 }: UnderConstructionProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 300" fill="none">
      <Defs>
        <LinearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#EFF6FF" stopOpacity="1" />
          <Stop offset="100%" stopColor="#DBEAFE" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      
      {/* Background */}
      <Rect width="400" height="300" fill="url(#bgGradient)"/>
      
      {/* Base Platform */}
      <Path d="M50 220 L350 220 L340 240 L60 240 Z" fill="#E2E8F0"/>
      <Rect x="60" y="235" width="280" height="8" rx="4" fill="#CBD5E1"/>
      
      {/* Main Device/Screen */}
      <Rect x="120" y="100" width="160" height="120" rx="8" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="3"/>
      <Rect x="130" y="110" width="140" height="90" rx="4" fill="#DBEAFE"/>
      
      {/* Screen Content Lines */}
      <Rect x="145" y="125" width="80" height="8" rx="4" fill="#93C5FD"/>
      <Rect x="145" y="140" width="110" height="6" rx="3" fill="#BFDBFE"/>
      <Rect x="145" y="153" width="90" height="6" rx="3" fill="#BFDBFE"/>
      <Rect x="145" y="170" width="100" height="8" rx="4" fill="#93C5FD"/>
      <Rect x="145" y="185" width="75" height="6" rx="3" fill="#BFDBFE"/>
      
      {/* Home Button */}
      <Circle cx="200" cy="215" r="6" fill="#94A3B8"/>
      
      {/* Left Crane */}
      <G>
        <Rect x="30" y="200" width="40" height="20" rx="4" fill="#64748B"/>
        <Rect x="38" y="190" width="24" height="10" fill="#475569"/>
        <Rect x="46" y="80" width="8" height="110" fill="#475569"/>
        <Rect x="20" y="75" width="70" height="6" fill="#F59E0B"/>
        <Line x1="54" y1="75" x2="54" y2="68" stroke="#64748B" strokeWidth="2"/>
        <Line x1="25" y1="81" x2="25" y2="95" stroke="#334155" strokeWidth="2"/>
        <Circle cx="25" cy="98" r="3" fill="#64748B"/>
      </G>
      
      {/* Right Crane */}
      <G>
        <Rect x="330" y="200" width="40" height="20" rx="4" fill="#64748B"/>
        <Rect x="338" y="190" width="24" height="10" fill="#475569"/>
        <Rect x="346" y="80" width="8" height="110" fill="#475569"/>
        <Rect x="310" y="75" width="70" height="6" fill="#F59E0B"/>
        <Line x1="354" y1="75" x2="354" y2="68" stroke="#64748B" strokeWidth="2"/>
        <Line x1="375" y1="81" x2="375" y2="95" stroke="#334155" strokeWidth="2"/>
        <Circle cx="375" cy="98" r="3" fill="#64748B"/>
      </G>
      
      {/* Traffic Cones */}
      <G>
        {/* Left Cone */}
        <Path d="M85 210 L75 240 L95 240 Z" fill="#F97316"/>
        <Rect x="75" y="237" width="20" height="6" rx="2" fill="#292524"/>
        <Line x1="77" y1="222" x2="93" y2="222" stroke="#FFFFFF" strokeWidth="2"/>
        <Line x1="79" y1="230" x2="91" y2="230" stroke="#FFFFFF" strokeWidth="2"/>
        
        {/* Right Cone */}
        <Path d="M315 210 L305 240 L325 240 Z" fill="#F97316"/>
        <Rect x="305" y="237" width="20" height="6" rx="2" fill="#292524"/>
        <Line x1="307" y1="222" x2="323" y2="222" stroke="#FFFFFF" strokeWidth="2"/>
        <Line x1="309" y1="230" x2="321" y2="230" stroke="#FFFFFF" strokeWidth="2"/>
      </G>
      
      {/* Gear Icons (representing work in progress) */}
      <G opacity="0.3">
        <Circle cx="100" cy="50" r="12" fill="none" stroke="#3B82F6" strokeWidth="2"/>
        <Circle cx="100" cy="50" r="6" fill="#3B82F6"/>
        <Rect x="94" y="38" width="12" height="4" rx="1" fill="#3B82F6"/>
        <Rect x="94" y="58" width="12" height="4" rx="1" fill="#3B82F6"/>
        <Rect x="88" y="44" width="4" height="12" rx="1" fill="#3B82F6"/>
        <Rect x="108" y="44" width="4" height="12" rx="1" fill="#3B82F6"/>
        
        <Circle cx="300" cy="60" r="10" fill="none" stroke="#3B82F6" strokeWidth="2"/>
        <Circle cx="300" cy="60" r="5" fill="#3B82F6"/>
        <Rect x="295" y="50" width="10" height="3" rx="1" fill="#3B82F6"/>
        <Rect x="295" y="67" width="10" height="3" rx="1" fill="#3B82F6"/>
        <Rect x="290" y="55" width="3" height="10" rx="1" fill="#3B82F6"/>
        <Rect x="307" y="55" width="3" height="10" rx="1" fill="#3B82F6"/>
      </G>
      
      {/* Tools */}
      <G>
        {/* Wrench */}
        <Path d="M90 260 L95 255 L100 260 L97 263 L94 260 L90 264 Z" fill="#94A3B8" stroke="#64748B" strokeWidth="1"/>
        
        {/* Screwdriver */}
        <Rect x="310" y="260" width="20" height="4" rx="2" fill="#94A3B8"/>
        <Rect x="315" y="264" width="2" height="15" fill="#78350F"/>
        <Circle cx="316" cy="279" r="2" fill="#78350F"/>
      </G>
      
      {/* Progress Dots */}
      <Circle cx="180" cy="270" r="4" fill="#3B82F6"/>
      <Circle cx="195" cy="270" r="4" fill="#3B82F6" opacity="0.6"/>
      <Circle cx="210" cy="270" r="4" fill="#3B82F6" opacity="0.3"/>
    </Svg>
  );
}
