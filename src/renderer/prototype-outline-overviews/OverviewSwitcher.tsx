// PROTOTYPE (throwaway): answers "Outline overviews in Writing" (#67). Three
// layouts for the Chapter and Project overviews on the real app, switched from
// a floating bar: 0 is the MVP as it is, A/B/C are the candidates. Look B from
// the visual refresh (#66) is always on. The bar also forces light or dark.
// Mounted only in development (see index.tsx). Never merge to main.
//
// Edits made in the overviews are real: they autosave to the open Project,
// through the same editors as everywhere else. Try it on a copy.

import { useEffect, useState, useSyncExternalStore } from 'react';
import '../prototype-visual-refresh/variants.css';
import './overviews.css';

export const VARIANTS = [
  { key: '0', name: 'MVP today' },
  { key: 'A', name: 'Document' },
  { key: 'B', name: 'Accordion, also beside the Scene' },
  { key: 'C', name: 'Corkboard' },
] as const;
export type Variant = (typeof VARIANTS)[number]['key'];

type Theme = 'system' | 'light' | 'dark';
const THEMES: Theme[] = ['system', 'light', 'dark'];

const dark = window.matchMedia('(prefers-color-scheme: dark)');

function stored(key: string, fallback: string) {
  const fromUrl = new URLSearchParams(location.search).get(key);
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(`proto-${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

// The current layout, read by App through useOverviewVariant.
let current = stored('overview', 'A') as Variant;
const listeners = new Set<() => void>();

export function useOverviewVariant(): Variant {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

function apply(variant: Variant, theme: Theme) {
  const root = document.documentElement;
  root.dataset.protoVariant = 'B';
  root.dataset.protoOverview = variant;
  root.dataset.protoDark = String(
    theme === 'dark' || (theme === 'system' && dark.matches),
  );
  const url = new URL(location.href);
  url.searchParams.set('overview', variant);
  url.searchParams.set('theme', theme);
  history.replaceState(history.state, '', url);
  try {
    localStorage.setItem('proto-overview', variant);
    localStorage.setItem('proto-theme', theme);
  } catch {
    // Not needed for the prototype to work.
  }
  if (current !== variant) {
    current = variant;
    listeners.forEach((l) => l());
  }
}

/** Applies the stored look before React's first paint. */
export function applyStoredLook() {
  apply(current, stored('theme', 'system') as Theme);
}

export function OverviewSwitcher() {
  const variant = useOverviewVariant();
  const [theme, setTheme] = useState(() => stored('theme', 'system') as Theme);
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === variant),
  );

  useEffect(() => apply(variant, theme), [variant, theme]);

  useEffect(() => {
    const follow = () => apply(variant, theme);
    dark.addEventListener('change', follow);
    return () => dark.removeEventListener('change', follow);
  }, [variant, theme]);

  const step = (by: number) =>
    apply(
      VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key,
      theme,
    );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="tab"]',
        )
      )
        return;
      step(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="proto-switcher" aria-label="Prototype switcher">
      <button onClick={() => step(-1)} aria-label="Previous layout">
        ←
      </button>
      <span className="proto-switcher-label">
        <b>{VARIANTS[index].key}</b> {VARIANTS[index].name}
      </span>
      <button onClick={() => step(1)} aria-label="Next layout">
        →
      </button>
      <span className="proto-switcher-sep" />
      {THEMES.map((t) => (
        <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
          {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  );
}
