// PROTOTYPE (throwaway): answers "Zen mode and collapsible panes" (#116, map
// #113). Three ways the Writing room's side panes collapse and flip out, and
// what zen mode quietens, on the real app, switched from a floating bar:
//
//   A  Edge tabs: a collapsed pane leaves a labelled tab on its edge; a click
//      docks it back. Zen hides the header and status bar until the pointer
//      reaches the top or bottom edge.
//   B  Icon rail: a collapsed pane leaves a rail of icons; a click opens the
//      pane as a flyout over the Prose, a pin docks it. Zen keeps the rails
//      and a dimmed counts-only status bar.
//   C  Nothing: a collapsed pane leaves nothing; resting the pointer on the
//      window edge flies it out. Zen is a bare sheet; a small pill with the
//      count and an exit shows only while the mouse moves.
//
// The bar also sets the writing width (Narrow / Wide / Full) and forces light
// or dark, so all of it is judged together. Shortcuts (prototype only): F11
// zen, Ctrl+Shift+B left pane, Ctrl+Shift+A Assistant, Ctrl+Shift+M width.
// Esc leaves zen. State lives in memory: nothing is remembered.
// Mounted only in development (see index.tsx). Never merge to main.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './zen.css';

const VARIANTS = [
  { key: 'A', name: 'Edge tabs, docked' },
  { key: 'B', name: 'Icon rail, flyouts' },
  { key: 'C', name: 'Nothing left, hover edges' },
] as const;
type Variant = (typeof VARIANTS)[number]['key'];

type Side = 'open' | 'collapsed' | 'flyout';
type Width = 'narrow' | 'wide' | 'full';
type Theme = 'system' | 'light' | 'dark';
const WIDTHS: Width[] = ['narrow', 'wide', 'full'];
const THEMES: Theme[] = ['system', 'light', 'dark'];

const WRITING = '.room:not([hidden]):has(> .assistant-panel)';

function fromUrl<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = new URLSearchParams(location.search).get(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

/** The app's dark-mode rules, found once and then pointed at the forced theme. */
let darkRules: CSSMediaRule[] | null = null;

/** Points the app's dark-mode rules at the forced theme, or back at the OS. */
function forceTheme(theme: Theme) {
  darkRules ??= Array.from(document.styleSheets).flatMap((sheet) =>
    Array.from(sheet.cssRules).filter(
      (rule): rule is CSSMediaRule =>
        rule instanceof CSSMediaRule &&
        rule.media.mediaText.includes('prefers-color-scheme: dark'),
    ),
  );
  const media =
    theme === 'dark'
      ? 'all'
      : theme === 'light'
        ? 'not all'
        : '(prefers-color-scheme: dark)';
  for (const rule of darkRules) rule.media.mediaText = media;
  document.documentElement.style.colorScheme = theme === 'system' ? '' : theme;
}

/** Clicks one of the app's own tabs or buttons, as the Author would. */
function press(selector: string) {
  document.querySelector<HTMLElement>(`${WRITING} ${selector}`)?.click();
}

export function ZenPrototype() {
  const [variant, setVariant] = useState<Variant>(() =>
    fromUrl('variant', ['A', 'B', 'C'], 'A'),
  );
  const [theme, setTheme] = useState<Theme>(() =>
    fromUrl('theme', THEMES, 'system'),
  );
  const [width, setWidth] = useState<Width>('narrow');
  const [left, setLeft] = useState<Side>('open');
  const [right, setRight] = useState<Side>('open');
  const [zen, setZen] = useState(false);
  // Pane states from before zen, put back when it ends.
  const before = useRef<{ left: Side; right: Side }>({
    left: 'open',
    right: 'open',
  });
  const [writing, setWriting] = useState(false);
  const [panes, setPanes] = useState<{
    left: Element | null;
    right: Element | null;
  }>({
    left: null,
    right: null,
  });

  const index = VARIANTS.findIndex((v) => v.key === variant);
  const step = (by: number) => {
    setLeft((s) => (s === 'flyout' ? 'collapsed' : s));
    setRight((s) => (s === 'flyout' ? 'collapsed' : s));
    setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key);
  };

  // Whether the Writing room is the one shown: the affordances are Writing only.
  useEffect(() => {
    const check = () => {
      setWriting(document.querySelector(WRITING) !== null);
      const left = document.querySelector(`${WRITING} > .left-pane`);
      const right = document.querySelector(`${WRITING} > .assistant-panel`);
      setPanes((now) =>
        now.left === left && now.right === right ? now : { left, right },
      );
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement.dataset;
    root.zenVariant = variant;
    root.zenLeft = left;
    root.zenRight = right;
    root.zenWidth = width;
    root.zen = String(zen);
    const url = new URL(location.href);
    url.searchParams.set('variant', variant);
    url.searchParams.set('theme', theme);
    history.replaceState(history.state, '', url);
  }, [variant, left, right, width, zen, theme]);

  useEffect(() => forceTheme(theme), [theme]);

  function enterZen() {
    before.current = { left, right };
    setLeft('collapsed');
    setRight('collapsed');
    setZen(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function leaveZen() {
    setZen(false);
    setLeft(before.current.left);
    setRight(before.current.right);
    if (document.fullscreenElement) void document.exitFullscreen();
  }

  const toggleZen = () => (zen ? leaveZen() : enterZen());

  // Leaving full screen some other way (Esc in Chromium) leaves zen too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && zen) {
        setZen(false);
        setLeft(before.current.left);
        setRight(before.current.right);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [zen]);

  /** How a collapsed pane comes back, per variant: docked in A, flown out in B and C. */
  const reveal = (set: (s: Side) => void) =>
    set(variant === 'A' ? 'open' : 'flyout');
  const toggleSide = (side: Side, set: (s: Side) => void) =>
    side === 'open'
      ? set('collapsed')
      : side === 'flyout'
        ? set('collapsed')
        : reveal(set);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === 'F11') {
        event.preventDefault();
        toggleZen();
      } else if (mod && event.shiftKey && event.code === 'KeyB') {
        event.preventDefault();
        toggleSide(left, setLeft);
      } else if (mod && event.shiftKey && event.code === 'KeyA') {
        event.preventDefault();
        toggleSide(right, setRight);
      } else if (mod && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault();
        setWidth(WIDTHS[(WIDTHS.indexOf(width) + 1) % WIDTHS.length]);
      } else if (event.key === 'Escape') {
        if (left === 'flyout' || right === 'flyout') {
          setLeft((s) => (s === 'flyout' ? 'collapsed' : s));
          setRight((s) => (s === 'flyout' ? 'collapsed' : s));
        } else if (zen) leaveZen();
        return;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (!event.altKey) return;
        // Alt+←/→ cycles variants; plain arrows belong to the Prose here.
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // B: a click outside a flyout closes it. C: the pointer leaving it does.
  useEffect(() => {
    if (left !== 'flyout' && right !== 'flyout') return;
    const outside = (target: EventTarget | null) =>
      !(target as HTMLElement | null)?.closest(
        '.left-pane, .assistant-panel, .zen-rail, .zen-edge, .zen-switcher, .pinned-notes, [role="dialog"]',
      );
    const onDown = (event: MouseEvent) => {
      if (variant !== 'B' || !outside(event.target)) return;
      setLeft((s) => (s === 'flyout' ? 'collapsed' : s));
      setRight((s) => (s === 'flyout' ? 'collapsed' : s));
    };
    let timer = 0;
    const onMove = (event: MouseEvent) => {
      if (variant !== 'C') return;
      const pane = document.querySelector(
        `${WRITING} > ${left === 'flyout' ? '.left-pane' : '.assistant-panel'}`,
      );
      if (!pane) return;
      const box = pane.getBoundingClientRect();
      const away =
        event.clientX < box.left - 40 || event.clientX > box.right + 40;
      window.clearTimeout(timer);
      if (away)
        timer = window.setTimeout(() => {
          setLeft((s) => (s === 'flyout' ? 'collapsed' : s));
          setRight((s) => (s === 'flyout' ? 'collapsed' : s));
        }, 300);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mousemove', onMove);
      window.clearTimeout(timer);
    };
  }, [left, right, variant]);

  // A: the header and status bar slide in at the top and bottom edges in zen.
  // C: the zen pill shows while the mouse moves.
  const [edge, setEdge] = useState<'top' | 'bottom' | null>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!zen) return;
    let idle = 0;
    const onMove = (event: MouseEvent) => {
      const y = event.clientY;
      const h = window.innerHeight;
      setEdge((now) =>
        y < 8 || (now === 'top' && y < 60)
          ? 'top'
          : y > h - 8 || (now === 'bottom' && y > h - 40)
            ? 'bottom'
            : null,
      );
      setMoving(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setMoving(false), 1500);
    };
    const onType = () => {
      window.clearTimeout(idle);
      setMoving(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('keydown', onType);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('keydown', onType);
      window.clearTimeout(idle);
    };
  }, [zen]);
  useEffect(() => {
    const root = document.documentElement.dataset;
    root.zenEdge = edge ?? '';
    root.zenMoving = String(moving);
  }, [edge, moving]);

  const counts = () =>
    document.querySelector('.status-bar .counts')?.textContent ?? '';

  // C: resting the pointer on a window edge flies its pane out.
  const hover = (set: (s: Side) => void) => {
    let timer = 0;
    return {
      onMouseEnter: () => {
        timer = window.setTimeout(() => set('flyout'), 250);
      },
      onMouseLeave: () => window.clearTimeout(timer),
    };
  };

  const affordances = writing && (
    <>
      {variant === 'A' && left === 'collapsed' && (
        <div className="zen-edge zen-edge-left">
          <button
            onClick={() => {
              setLeft('open');
              setTimeout(() => press('#manuscript-tab'));
            }}
          >
            Manuscript
          </button>
          <button
            onClick={() => {
              setLeft('open');
              setTimeout(() => press('#bible-tab'));
            }}
          >
            Story Bible
          </button>
        </div>
      )}
      {variant === 'A' && right === 'collapsed' && (
        <div className="zen-edge zen-edge-right">
          <button onClick={() => setRight('open')}>Assistant</button>
        </div>
      )}
      {variant === 'A' && !zen && (
        <button
          className="zen-enter-a"
          onClick={enterZen}
          title="Zen mode (F11)"
        >
          Zen
        </button>
      )}

      {variant === 'B' && (left !== 'open' || zen) && (
        <nav className="zen-rail zen-rail-left" aria-label="Left rail">
          <RailButton
            label="Manuscript"
            pressed={
              left === 'flyout' &&
              !!document.querySelector('#manuscript-tab[aria-selected="true"]')
            }
            onClick={() => {
              setLeft('flyout');
              setTimeout(() => press('#manuscript-tab'));
            }}
          >
            <path d="M4 5h12M4 10h12M4 15h8" />
          </RailButton>
          <RailButton
            label="Story Bible"
            pressed={
              left === 'flyout' &&
              !!document.querySelector('#bible-tab[aria-selected="true"]')
            }
            onClick={() => {
              setLeft('flyout');
              setTimeout(() => press('#bible-tab'));
            }}
          >
            <path d="M4 4h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H4zM16 4h-5M16 4v10h-5" />
          </RailButton>
          <RailButton
            label="Overview"
            onClick={() => press('.overview-button')}
          >
            <path d="M4 4h4v12H4zM11 5h5M11 9h5M11 13h5" />
          </RailButton>
          <span className="zen-rail-gap" />
          <RailButton
            label={zen ? 'Leave zen (Esc)' : 'Zen mode (F11)'}
            pressed={zen}
            onClick={toggleZen}
          >
            <circle cx="10" cy="10" r="6" />
          </RailButton>
        </nav>
      )}
      {variant === 'B' && (right !== 'open' || zen) && (
        <nav className="zen-rail zen-rail-right" aria-label="Right rail">
          <RailButton
            label="Assistant"
            pressed={right === 'flyout'}
            onClick={() =>
              setRight(right === 'flyout' ? 'collapsed' : 'flyout')
            }
          >
            <path d="M4 5h12v8H9l-4 3v-3H4z" />
          </RailButton>
        </nav>
      )}
      {variant === 'B' &&
        (
          [
            [left, setLeft, panes.left],
            [right, setRight, panes.right],
          ] as const
        ).map(
          ([side, set, pane]) =>
            side === 'flyout' &&
            pane &&
            createPortal(
              <button
                className="zen-pin"
                title="Dock this pane"
                onClick={() => set('open')}
              >
                Pin
              </button>,
              pane,
            ),
        )}

      {variant === 'C' && left === 'collapsed' && (
        <div className="zen-hot zen-hot-left" {...hover(setLeft)} />
      )}
      {variant === 'C' && right === 'collapsed' && (
        <div className="zen-hot zen-hot-right" {...hover(setRight)} />
      )}
      {variant === 'C' && zen && (
        <div className="zen-pill">
          <span>{counts()}</span>
          <button onClick={leaveZen}>Leave zen</button>
        </div>
      )}

      {/* An open pane collapses from a small button on its inner edge. */}
      {left === 'open' &&
        panes.left &&
        createPortal(
          <button
            className="zen-collapse zen-collapse-left"
            title="Collapse (Ctrl+Shift+B)"
            onClick={() => setLeft('collapsed')}
          >
            «
          </button>,
          panes.left,
        )}
      {right === 'open' &&
        panes.right &&
        createPortal(
          <button
            className="zen-collapse zen-collapse-right"
            title="Collapse (Ctrl+Shift+A)"
            onClick={() => setRight('collapsed')}
          >
            »
          </button>,
          panes.right,
        )}
    </>
  );

  return createPortal(
    <>
      {affordances}
      <div className="zen-switcher" aria-label="Prototype switcher">
        <div className="zen-switcher-row">
          <button onClick={() => step(-1)} aria-label="Previous variant">
            ←
          </button>
          <span className="zen-switcher-label">
            <b>{variant}</b> {VARIANTS[index].name}
          </span>
          <button onClick={() => step(1)} aria-label="Next variant">
            →
          </button>
          <span className="zen-switcher-sep" />
          {WIDTHS.map((w) => (
            <button
              key={w}
              aria-pressed={width === w}
              onClick={() => setWidth(w)}
            >
              {w[0].toUpperCase() + w.slice(1)}
            </button>
          ))}
          <span className="zen-switcher-sep" />
          {THEMES.map((t) => (
            <button
              key={t}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <span className="zen-switcher-sep" />
          <button aria-pressed={zen} onClick={toggleZen}>
            Zen
          </button>
        </div>
        <div className="zen-switcher-state">
          left pane: {left} · Assistant: {right} · zen: {zen ? 'on' : 'off'} ·
          width: {width} ·{' '}
          {writing ? 'Writing' : 'not Writing: panes untouched'}
        </div>
      </div>
    </>,
    document.body,
  );
}

function RailButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="zen-rail-button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
