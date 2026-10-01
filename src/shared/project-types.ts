// Types shared by main, preload and renderer. The renderer never sees paths or
// file formats, only these values.

export type SceneRef = { kind: 'scene'; id: string };
export type UnitRef = SceneRef;

export type SceneValue = { id: string; markdown: string };
export type UnitValue = SceneValue;

export type SceneNode = { id: string; title: string };
export type ChapterNode = { id: string; title: string; scenes: SceneNode[] };
export type ProjectTree = { chapters: ChapterNode[] };

/**
 * The Manuscript as the binder shows it: the tree from `project.json`, with
 * Scenes whose file is missing marked, and Scene files the tree doesn't place.
 */
export type Manuscript = {
  chapters: ManuscriptChapter[];
  unplaced: SceneNode[];
};
export type ManuscriptChapter = {
  id: string;
  title: string;
  scenes: ManuscriptScene[];
};
/** `missing`: in the tree, but its file isn't there (possibly not synced yet). */
export type ManuscriptScene = SceneNode & { missing?: true };

/** The languages Prose is spellchecked and typeset in. */
export type ProseLanguage = 'sv-SE' | 'en-US';

/** Reads a Project's `language`: Swedish when it says so, else English. */
export function proseLanguage(language: string): ProseLanguage {
  return /^sv\b/i.test(language) ? 'sv-SE' : 'en-US';
}
