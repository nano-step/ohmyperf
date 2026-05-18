'use client';

import { useEffect } from 'react';
import { getBrandCss } from '@ohmyperf/design-tokens';
import { useSelectedStyle } from './style-picker';

const STYLE_ID = 'ohmyperf-brand-css';

export function BrandStyleInjector(): null {
  const style = useSelectedStyle();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      el.setAttribute('data-ohmyperf-brand', style);
      document.head.appendChild(el);
    }
    el.setAttribute('data-ohmyperf-brand', style);
    el.textContent = style === 'calibre' ? '' : getBrandCss(style, 'system');
  }, [style]);
  return null;
}
