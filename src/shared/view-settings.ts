/** How wide the Prose sheet's text runs: about 38, 52 or at most 72 rem. */
export type WritingWidth = 'narrow' | 'wide' | 'full';

export const WRITING_WIDTHS: readonly WritingWidth[] = [
  'narrow',
  'wide',
  'full',
];

export const WRITING_WIDTH_LABELS: Record<WritingWidth, string> = {
  narrow: 'Narrow',
  wide: 'Wide',
  full: 'Full',
};

/** Light or dark, or as the system is. */
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** How every window looks on this computer, set from the View menu. */
export type ViewSettings = {
  writingWidth: WritingWidth;
  theme: Theme;
  /** Its language follows the Project's Prose language. */
  spellCheck: boolean;
};

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  writingWidth: 'narrow',
  theme: 'system',
  spellCheck: true,
};

/** The width after `width`, as Ctrl+Shift+W cycles them. */
export function nextWritingWidth(width: WritingWidth): WritingWidth {
  return WRITING_WIDTHS[
    (WRITING_WIDTHS.indexOf(width) + 1) % WRITING_WIDTHS.length
  ];
}

/** The valid settings of `raw`, as a window or a file gives them; the rest left out. */
export function parseViewSettings(raw: unknown): Partial<ViewSettings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const { writingWidth, theme, spellCheck } = raw as Record<string, unknown>;
  return {
    ...(WRITING_WIDTHS.includes(writingWidth as WritingWidth) && {
      writingWidth: writingWidth as WritingWidth,
    }),
    ...(THEMES.includes(theme as Theme) && { theme: theme as Theme }),
    ...(typeof spellCheck === 'boolean' && { spellCheck }),
  };
}
