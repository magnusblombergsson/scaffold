// PROTOTYPE (throwaway): the floating bar switching the Plan Room prototype's
// variants (#300). ← and → cycle; the choice is kept in the URL and in
// localStorage. Light and dark follow the app's Theme Setting. Mounted only
// in development (see index.tsx). Never merge to main.

import { useEffect, useSyncExternalStore } from 'react';

export const VARIANTS = [
  { key: 'A', name: 'Beside the Conversation' },
  { key: 'B', name: 'The plan in the middle' },
  { key: 'C', name: 'Beat timeline and Changes' },
] as const;
export type PlanVariant = (typeof VARIANTS)[number]['key'];

function stored(): PlanVariant {
  const fromUrl = new URLSearchParams(location.search).get('plan');
  if (fromUrl && VARIANTS.some((v) => v.key === fromUrl))
    return fromUrl as PlanVariant;
  try {
    const kept = localStorage.getItem('proto-plan');
    if (kept && VARIANTS.some((v) => v.key === kept))
      return kept as PlanVariant;
  } catch {
    // Not needed for the prototype to work.
  }
  return 'A';
}

let current = stored();
const listeners = new Set<() => void>();

export function usePlanVariant(): PlanVariant {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

function choose(variant: PlanVariant) {
  const url = new URL(location.href);
  url.searchParams.set('plan', variant);
  history.replaceState(history.state, '', url);
  try {
    localStorage.setItem('proto-plan', variant);
  } catch {
    // Not needed for the prototype to work.
  }
  current = variant;
  listeners.forEach((l) => l());
}

export function PlanSwitcher() {
  const variant = usePlanVariant();
  const index = VARIANTS.findIndex((v) => v.key === variant);
  const step = (by: number) =>
    choose(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!document.querySelector('.proto-plan')?.checkVisibility()) return;
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
      <button onClick={() => step(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="proto-switcher-label">
        <b>{VARIANTS[index].key}</b> {VARIANTS[index].name}
      </span>
      <button onClick={() => step(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
