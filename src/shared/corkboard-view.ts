/**
 * What every Corkboard of a Project shows on this computer: each card's
 * Outline and Notes, or its image large. It changes only what the Author sees.
 */
export type CorkboardView = 'text' | 'images';

/** What `settings.json` keeps or a window sends; text for any other value. */
export function readCorkboardView(stored: unknown): CorkboardView {
  return stored === 'images' ? 'images' : 'text';
}
