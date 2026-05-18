'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BRAND_IDS, BRAND_MANIFEST, type BrandId } from '@ohmyperf/design-tokens';

const STORAGE_KEY = 'ohmyperf:style';

function readStoredStyle(): BrandId {
  if (typeof window === 'undefined') return 'calibre';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (BRAND_IDS as ReadonlyArray<string>).includes(stored)) return stored as BrandId;
  return 'calibre';
}

export function StylePicker(): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlStyle = searchParams.get('style');
  const initial: BrandId =
    urlStyle && (BRAND_IDS as ReadonlyArray<string>).includes(urlStyle)
      ? (urlStyle as BrandId)
      : readStoredStyle();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<BrandId>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, current);
    const params = new URLSearchParams(searchParams.toString());
    if (current === 'calibre') params.delete('style');
    else params.set('style', current);
    const qs = params.toString();
    const target = qs.length > 0 ? `${pathname}?${qs}` : pathname;
    router.replace(target, { scroll: false });
  }, [current, pathname, router, searchParams]);

  const display = BRAND_MANIFEST[current].displayName;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid="style-picker"
        className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-[var(--color-muted-foreground)]">Style:</span>
        <span>{display}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-md"
        >
          {BRAND_IDS.map((id) => {
            const m = BRAND_MANIFEST[id];
            const isSelected = id === current;
            return (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setCurrent(id);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-muted)] ${
                    isSelected ? 'font-semibold text-[var(--color-accent-primary)]' : ''
                  }`}
                  data-style-id={id}
                >
                  {m.displayName}
                  {isSelected ? (
                    <span className="ml-2 text-[var(--color-accent-primary)]" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function useSelectedStyle(): BrandId {
  const searchParams = useSearchParams();
  const urlStyle = searchParams.get('style');
  if (urlStyle && (BRAND_IDS as ReadonlyArray<string>).includes(urlStyle)) {
    return urlStyle as BrandId;
  }
  return 'calibre';
}
