// Types shared by main, preload and renderer. The renderer never sees paths or
// file formats, only these values.

/** The id of the Project Outline, of the whole story, beside the ids of Chapters and Scenes. */
export const PROJECT_OUTLINE = 'project';

export type SceneRef = { kind: 'scene'; id: string };
/** The Outline of a Chapter or Scene, or with the id `PROJECT_OUTLINE`, of the Project. */
export type OutlineRef = { kind: 'outline'; id: string };
/** The Author's Notes on a Chapter or Scene. */
export type NotesRef = { kind: 'notes'; id: string };
export type UnitRef = SceneRef | OutlineRef | NotesRef;

export type SceneValue = { id: string; markdown: string };
/**
 * An Outline's bullets as plain text, and its unit's metadata (such as POV,
 * status and targets), kept as frontmatter, including keys this app doesn't
 * know.
 */
export type OutlineValue = {
  id: string;
  body: string;
  meta: Record<string, unknown>;
};
export type NotesValue = { id: string; body: string };
export type UnitValue = SceneValue | OutlineValue | NotesValue;

/** The value a unit of `ref`'s kind holds. */
export type ValueOf<R extends UnitRef> = R extends SceneRef
  ? SceneValue
  : R extends OutlineRef
    ? OutlineValue
    : NotesValue;

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

/**
 * A deleted Scene or Chapter, recoverable until Trash is emptied. A Scene
 * names the Chapter it was deleted from, if it had one; a Chapter lists the
 * Scenes deleted with it.
 */
export type TrashItem =
  | {
      kind: 'scene';
      id: string;
      title: string;
      trashedAt: number;
      chapterTitle?: string;
    }
  | {
      kind: 'chapter';
      id: string;
      title: string;
      trashedAt: number;
      scenes: SceneNode[];
    };

/** The languages Prose is spellchecked and typeset in. */
export type ProseLanguage = 'sv-SE' | 'en-US';

/** Reads a Project's `language`: Swedish when it says so, else English. */
export function proseLanguage(language: string): ProseLanguage {
  return /^sv\b/i.test(language) ? 'sv-SE' : 'en-US';
}
