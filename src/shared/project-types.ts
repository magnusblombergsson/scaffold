import type { Mode } from './conversation';

// Types shared by main, preload and renderer. The renderer never sees paths or
// file formats, only these values.

/** The id of the Project Outline, of the whole story, beside the ids of Chapters and Scenes. */
export const PROJECT_OUTLINE = 'project';

export type SceneRef = { kind: 'scene'; id: string };
/** The Outline of a Chapter or Scene, or with the id `PROJECT_OUTLINE`, of the Project. */
export type OutlineRef = { kind: 'outline'; id: string };
/** The Author's Notes on a Chapter or Scene. */
export type NotesRef = { kind: 'notes'; id: string };
/** A Story Bible Entry: its name, aliases, description and visibility. */
export type EntryRef = { kind: 'entry'; id: string };
/** An Entry's private notes, which the Assistant never sees. */
export type PrivateRef = { kind: 'private'; id: string };
export type UnitRef = SceneRef | OutlineRef | NotesRef | EntryRef | PrivateRef;

/** A unit's key in maps, such as `scene:<id>`. */
export function unitKey(ref: UnitRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** The seven fixed Entry types, in the order the Story Bible lists them. */
export const ENTRY_TYPES = [
  'character',
  'place',
  'item',
  'world-rule',
  'plot-thread',
  'theme',
  'other',
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  character: 'Character',
  place: 'Place',
  item: 'Item',
  'world-rule': 'World Rule',
  'plot-thread': 'Plot Thread',
  theme: 'Theme',
  other: 'Other',
};

/** Each type's heading over its Entries, in the Story Bible and its Export. */
export const ENTRY_GROUP_TITLES: Record<EntryType, string> = {
  character: 'Characters',
  place: 'Places',
  item: 'Items',
  'world-rule': 'World Rules',
  'plot-thread': 'Plot Threads',
  theme: 'Themes',
  other: 'Other',
};

/**
 * When the Assistant sees an Entry: `always`, `mentioned` when its name or
 * an alias is mentioned, or `never`.
 */
export type Visibility = 'always' | 'mentioned' | 'never';
export const VISIBILITIES: readonly Visibility[] = [
  'always',
  'mentioned',
  'never',
];
export const DEFAULT_VISIBILITY: Visibility = 'mentioned';

/** A Character's part in the story; `null` until the Author says. */
export type Role = 'protagonist' | 'supporting' | 'mentioned';
export const ROLES: readonly Role[] = [
  'protagonist',
  'supporting',
  'mentioned',
];
export const ROLE_LABELS: Record<Role, string> = {
  protagonist: 'Protagonist',
  supporting: 'Supporting',
  mentioned: 'Mentioned only',
};

/**
 * A Character's Voice: traits (register, rhythm, tics), words they say and
 * never say, and example lines, which only the Author writes.
 */
export type Voice = {
  traits: string;
  says: string[];
  neverSays: string[];
  examples: string[];
};

/** What a Place is like to each sense, and its atmosphere. */
export type Senses = {
  smells: string;
  sight: string;
  sound: string;
  touch: string;
  atmosphere: string;
};

/** Whether a Plot Thread is still open. */
export type ThreadStatus = 'open' | 'resolved';
export const THREAD_STATUSES: readonly ThreadStatus[] = ['open', 'resolved'];
export const STATUS_LABELS: Record<ThreadStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
};

/**
 * An Entry's type-specific fields: a Character has `role`, with a short
 * `roleNote` beside it, `appearance` and `voice`, a Place `senses` and a
 * Plot Thread `status`; the other types have none.
 */
export type EntryFields = {
  role?: Role | null;
  roleNote?: string;
  appearance?: string;
  voice?: Voice;
  senses?: Senses;
  status?: ThreadStatus;
};

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
/** An Entry; its `description` is what the Assistant reads. */
export type EntryValue = {
  id: string;
  type: EntryType;
  name: string;
  aliases: string[];
  visibility: Visibility;
  description: string;
  fields: EntryFields;
  /**
   * Its image's file in `images/`, if it has one. Only `setEntryImage` and
   * `removeEntryImage` change it; a write keeps the image the Entry has.
   */
  image?: string;
  /**
   * Its Tags, by spelling; none when it has none. Only `setTags` changes
   * them; a write keeps the Tags the Entry has.
   */
  tags?: string[];
};
export type PrivateValue = { id: string; body: string };
export type UnitValue =
  | SceneValue
  | OutlineValue
  | NotesValue
  | EntryValue
  | PrivateValue;

/**
 * The text a unit holds: a Scene's Prose, an Entry's description, or the
 * body of an Outline, Notes or private notes.
 */
export function unitText(value: UnitValue): string {
  if ('markdown' in value) return value.markdown;
  if ('description' in value) return value.description;
  return value.body;
}

/** The value a unit of `ref`'s kind holds. */
export type ValueOf<R extends UnitRef> = R extends SceneRef
  ? SceneValue
  : R extends OutlineRef
    ? OutlineValue
    : R extends EntryRef
      ? EntryValue
      : R extends PrivateRef
        ? PrivateValue
        : NotesValue;

/** An Entry as the Story Bible tab lists it. */
export type EntrySummary = {
  id: string;
  type: EntryType;
  name: string;
  aliases: string[];
  visibility: Visibility;
  /** Its image's file in `images/`, if it has one. */
  image?: string;
  /** Its Tags, by spelling; none when it has none. */
  tags?: string[];
};

/** The extensions an Entry's, Scene's or Chapter's image is stored with. */
export type ImageExtension = 'jpg' | 'png';

/** An Entry's, Scene's or Chapter's image's bytes, as stored in `images/`. */
export type EntryImage = { data: Uint8Array; extension: ImageExtension };

export type SceneNode = { id: string; title: string };
export type ChapterNode = { id: string; title: string; scenes: SceneNode[] };
export type ProjectTree = { chapters: ChapterNode[] };

/**
 * The Manuscript as the binder shows it: the tree from `project.json`, with
 * Scenes whose file is missing marked, and Scene files the tree doesn't place.
 */
export type Manuscript = {
  chapters: ManuscriptChapter[];
  unplaced: ManuscriptScene[];
  /** The Manuscript's Word target, as the Project Outline's file holds it. */
  wordTarget?: number;
};
/**
 * `status`: the id of its Status, as its Outline file holds it, which may
 * not be in the Project's Status list. `tags`: its Tags, by spelling; none
 * when it has none. `image`: its image's file in `images/`, if it has one.
 * `wordTarget`: its Word target, in words, if it has one.
 */
export type ManuscriptChapter = {
  id: string;
  title: string;
  scenes: ManuscriptScene[];
  status?: string;
  tags?: string[];
  image?: string;
  wordTarget?: number;
};
/** `missing`: in the tree, but its file isn't there (possibly not synced yet). */
export type ManuscriptScene = SceneNode & {
  missing?: true;
  status?: string;
  tags?: string[];
  image?: string;
  wordTarget?: number;
};

/**
 * A deleted Scene or Chapter, or a version of a unit set aside when its
 * Conflict was resolved, recoverable until Trash is emptied. A Scene names the
 * Chapter it was deleted from, if it had one; a Chapter lists the Scenes
 * deleted with it. A version's `title` names its unit, as in “Opening” or the
 * Outline of “Opening”; restoring it brings the Conflict back.
 */
export type TrashItem =
  | {
      kind: 'version';
      id: string;
      title: string;
      trashedAt: number;
      host?: string;
      savedAt: number;
    }
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
    }
  | {
      kind: 'entry';
      id: string;
      title: string;
      trashedAt: number;
      type: EntryType;
    }
  | {
      kind: 'conversation';
      id: string;
      title: string;
      trashedAt: number;
      mode: Mode;
    };

/** The languages Prose is spellchecked and typeset in. */
export type ProseLanguage = 'sv-SE' | 'en-US';

/** The languages the Author can choose for the Prose, in the order offered. */
export const PROSE_LANGUAGES: { language: ProseLanguage; label: string }[] = [
  { language: 'en-US', label: 'English' },
  { language: 'sv-SE', label: 'Swedish' },
];

/** Reads a Project's `language`: Swedish when it says so, else English. */
export function proseLanguage(language: string): ProseLanguage {
  return /^sv\b/i.test(language) ? 'sv-SE' : 'en-US';
}
