import {
  DEFAULT_VIEW_SETTINGS,
  nextWritingWidth,
  type ViewSettings,
} from '../shared/view-settings';

/** The Settings as this window last heard them. */
let current: ViewSettings = DEFAULT_VIEW_SETTINGS;

/**
 * Shows the writing width, spell check and typewriter scrolling on the
 * page, now and as they change, from any window or the menu. Every editor and field inherits the
 * page's `spellcheck`, so turning it off takes the squiggles away at once.
 * Turned on again, Chromium checks text already written as it is edited or
 * opened.
 * Main sets the theme itself.
 */
export function followViewSettings(): void {
  void window.shell.viewSettings().then(show);
  window.shell.onViewSettings(show);
}

function show(view: ViewSettings): void {
  current = view;
  const root = document.documentElement;
  root.spellcheck = view.spellCheck;
  root.dataset.writingWidth = view.writingWidth;
  root.dataset.typewriter = String(view.typewriter);
}

/** The next writing width, as Ctrl+Shift+W asks; shown before main confirms it. */
export function cycleWritingWidth(): void {
  const writingWidth = nextWritingWidth(current.writingWidth);
  show({ ...current, writingWidth });
  window.shell.setViewSettings({ writingWidth });
}

/** Typewriter scrolling on or off, as Ctrl+Shift+T asks; shown before main confirms it. */
export function toggleTypewriter(): void {
  const typewriter = !current.typewriter;
  show({ ...current, typewriter });
  window.shell.setViewSettings({ typewriter });
}
