// PROTOTYPE (throwaway): answers "Visual refresh: pane colours, buttons,
// dropdowns, editable cues" (#66). Four looks on the real app, switched from a
// floating bar: 0 is the MVP as it is, A/B/C are the candidates. Each one is a
// block of CSS in variants.css, scoped by <html data-proto-variant>. The bar
// also forces light or dark so both can be judged without changing the OS.
// Mounted only in development (see index.tsx). Never merge to main.

import { useEffect, useState } from 'react';
import './variants.css';

const VARIANTS = [
  { key: '0', name: 'MVP today' },
  { key: 'A', name: 'Tinted panes, soft wells' },
  { key: 'B', name: 'Paper on a desk' },
  { key: 'C', name: 'Desktop form' },
] as const;

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

function apply(variant: string, theme: Theme) {
  const root = document.documentElement;
  root.dataset.protoVariant = variant;
  root.dataset.protoDark = String(
    theme === 'dark' || (theme === 'system' && dark.matches),
  );
  const url = new URL(location.href);
  url.searchParams.set('variant', variant);
  url.searchParams.set('theme', theme);
  history.replaceState(history.state, '', url);
  try {
    localStorage.setItem('proto-variant', variant);
    localStorage.setItem('proto-theme', theme);
  } catch {
    // Not needed for the prototype to work.
  }
}

/** Applies the stored look before React's first paint. */
export function applyStoredLook() {
  apply(stored('variant', 'A'), stored('theme', 'system') as Theme);
}

export function PrototypeSwitcher() {
  const [variant, setVariant] = useState(() => stored('variant', 'A'));
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
    setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
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
      <button onClick={() => step(-1)} aria-label="Previous look">
        ←
      </button>
      <span className="proto-switcher-label">
        <b>{VARIANTS[index].key}</b> {VARIANTS[index].name}
      </span>
      <button onClick={() => step(1)} aria-label="Next look">
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
