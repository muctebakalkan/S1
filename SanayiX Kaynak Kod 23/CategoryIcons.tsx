/**
 * Kategori SVG İkonları
 * react-native-svg ile çizilmiş, tamamen vektörel.
 */
import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, G } from 'react-native-svg';

interface IconProps { size?: number; color?: string; }

// Motor — dişli çark
export const MotorIcon = ({ size = 28, color = '#0F2167' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
    <Path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

// Elektrik — şimşek / yıldırım
export const ElektrikIcon = ({ size = 28, color = '#0F2167' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8Z"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

// Lastik — tekerlek / daire
export const LastikIcon = ({ size = 28, color = '#0F2167' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
    <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={1.8} />
    <Line x1="12" y1="3" x2="12" y2="8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1="12" y1="16" x2="12" y2="21" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1="3" y1="12" x2="8" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1="16" y1="12" x2="21" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

// Kaporta — araba silüeti / panel
export const KaportaIcon = ({ size = 28, color = '#0F2167' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 17H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 .55-.89L5 10l3-5h8l3 5 2.45 1.11A1 1 0 0 1 22 12v4a1 1 0 0 1-1 1h-2"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    />
    <Circle cx="7.5" cy="17.5" r="2.5" stroke={color} strokeWidth={1.8} />
    <Circle cx="16.5" cy="17.5" r="2.5" stroke={color} strokeWidth={1.8} />
    <Path d="M8 10h8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

// Fren — disk fren
export const FrenIcon = ({ size = 28, color = '#0F2167' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.8} />
    <Path
      d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
      stroke={color} strokeWidth={1.8} strokeLinecap="round"
    />
  </Svg>
);

// Klima — kar tanesi / hava akışı
export const KlimaIcon = ({ size = 28, color = '#0F2167' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Line x1="19.07" y1="4.93" x2="4.93" y2="19.07" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Path d="M12 6l1.5 2.5L12 11 10.5 8.5 12 6Z" fill={color} />
    <Path d="M12 18l1.5-2.5L12 13l-1.5 2.5L12 18Z" fill={color} />
    <Path d="M6 12l2.5 1.5L11 12 8.5 10.5 6 12Z" fill={color} />
    <Path d="M18 12l-2.5 1.5L13 12l2.5-1.5L18 12Z" fill={color} />
  </Svg>
);
