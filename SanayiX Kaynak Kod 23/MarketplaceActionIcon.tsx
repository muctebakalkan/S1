import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { MARKETPLACE_THEME as T } from '../lib/marketplaceTheme';

/** Outline symbols shared by the four reference home cards. */
export function MarketplaceActionIcon({ type, size = 34 }: { type: 'fault' | 'parts' | 'service' | 'maintenance'; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={T.primary} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    {type === 'fault' && <><Path d="M12 7V5a4 4 0 018 0v2M11 9c-4 4-6 10-6 15 0 3 22 3 22 0 0-5-2-11-6-15Z" /><Path d="M16 13v6" /><Circle cx="16" cy="23" r=".7" fill={T.primary} /></>}
    {type === 'parts' && <><Path d="m13 5-7-2-4 5 1 11 6 2 5-4M2 8l7 3 4-6M9 11v10" /><Path d="m22 10 3 2 3-1 2 5-2 2v4l-4 3-3-1-3 1-4-4 1-3-1-3 4-4Z" /><Circle cx="22" cy="18" r="3.5" /><Path d="M5 22v4l6 3 4-3" /></>}
    {type === 'service' && <><Path d="m6 12 3-7h14l3 7M4 14l3-3h18l3 3v11H4ZM7 25v3M25 25v3" /><Path d="M8 18h4M20 18h4M13 22h6" /><Path d="M2 11h4M26 11h4" /></>}
    {type === 'maintenance' && <><Rect x="5" y="6" width="22" height="23" rx="3" /><Path d="M11 3v6M21 3v6M5 13h22M11 20l4 4 7-8" /></>}
  </Svg>;
}
