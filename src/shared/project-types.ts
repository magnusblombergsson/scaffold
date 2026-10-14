import type { Mode } from './conversation';
import type { CustomValues } from './custom-field';
import type { Orphaned } from './proposal';

// Types shared by main, preload and renderer. The renderer never sees paths or
// file formats, only these values.

/**
 * The id of the Project Outline, of the whole story, beside the ids of
 * Chapters and Scenes: in a Series, the Series Outline above each Book's.
 */
export const PROJECT_OUTLINE = 'project';

export type SceneRef = { kind: 'scene'; id: string };
/** The Outline of a Book, Part, Chapter or Scene, or with the id `PROJECT_OUTLINE`, of the Project. */
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
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  always: 'Always',
  mentioned: 'When mentioned',
  never: 'Never',
};

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
   * Its values in the Project's Custom fields, by field id; none when it
   * holds none. A value of a field that isn't defined here, as one in Trash
   * or not yet synced, is kept and not shown.
   */
  custom?: CustomValues;
  /**
   * Its image's file in `images/`, if it has one. Only `setImage` and
   * `removeImage` change it; a write keeps the image the Entry has.
   */
  image?: string;
  /**
   * Its Tags, by spelling; none when it has none. Only `setTags` changes
   * them; a write keeps the Tags the Entry has.
   */
  tags?: string[];
  /**
   * In a Series, the values it takes from a Book onward, by Book id; none
   * when it has none. Entry text, as its fields are.
   */
  evolutions?: Evolutions;
  /**
   * The Book it first appears in, by id; none when not said. A unit
   * detail: only `setFirstAppears` changes it.
   */
  firstAppears?: string;
  /**
   * Its image from a Book onward, by Book id: each a file in `images/`. A
   * unit detail: only `setImage` and `removeImage` change them.
   */
  evolvedImages?: Record<string, string>;
};

/**
 * A field of an Entry that may evolve from one Book to the next, as a
 * Proposal names it, or its name or a Voice's example lines; its image
 * evolves too, as a unit detail. Never its type, Tags or private notes.
 */
export type EvolvingField =
  | 'name'
  | 'voice.examples'
  | 'description'
  | 'aliases'
  | 'role'
  | 'roleNote'
  | 'appearance'
  | 'status'
  | 'voice.traits'
  | 'voice.says'
  | 'voice.neverSays'
  | 'senses.smells'
  | 'senses.sight'
  | 'senses.sound'
  | 'senses.touch'
  | 'senses.atmosphere'
  | `custom:${string}`;

/** The values an Evolution gives its fields: text, a list, or a Role, which may be unset. */
export type Evolution = Partial<
  Record<EvolvingField, string | string[] | null>
>;

/** An Entry's Evolutions, by the id of the Book each takes effect from. */
export type Evolutions = Record<string, Evolution>;
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
  /** The Book it first appears in, by id; none when not said. */
  firstAppears?: string;
  /** Of each Book it has an Evolution from, by id: what the list and highlighting need. */
  evolved?: Record<string, EvolutionSummary>;
  /** Its image from a Book onward, by Book id. */
  evolvedImages?: Record<string, string>;
};

/** An Evolution as the Story Bible lists it: the name and aliases it gives, and how many values it changes. */
export type EvolutionSummary = {
  name?: string;
  aliases?: string[];
  values: number;
};

/**
 * What a unit detail is addressed by (ADR 0008): a Scene, a Chapter, a
 * Part, a Book or an Entry by id, or the Manuscript, which is the Project
 * Outline's.
 */
export type DetailRef =
  | { kind: 'scene' | 'chapter' | 'part' | 'book' | 'entry'; id: string }
  | { kind: 'manuscript' };

/**
 * What an image belongs to: any unit but the Manuscript. With a `book`, an
 * Entry's image from that Book on, in a Series: an Evolution's.
 */
export type ImageRef =
  | { kind: 'scene' | 'chapter' | 'part' | 'book'; id: string }
  | { kind: 'entry'; id: string; book?: string };

/** The extensions an Entry's, Scene's or Chapter's image is stored with. */
export type ImageExtension = 'jpg' | 'png';

/** An Entry's, Scene's or Chapter's image's bytes, as stored in `images/`. */
export type EntryImage = { data: Uint8Array; extension: ImageExtension };

/** A unit holding an image, with its title, or an Entry's name. */
export type ImageHolder = ImageRef & { title: string };

/**
 * An image another unit can take a copy of: one file, or several identical
 * ones, with the units holding it, those in the Drawer marked; it is read
 * from the first.
 */
export type ProjectImage = { holders: (ImageHolder & { drawer?: true })[] };

/**
 * The other units holding an image identical to a unit's own, as
 * `ProjectImage` counts them one: those live, and how many in the Drawer or
 * Trash.
 */
export type ImageMatches = { live: ImageHolder[]; elsewhere: number };

/** Why a unit's image wasn't replaced: it is in Trash or the Drawer, gone, or couldn't be saved. */
export type ImageSkip = Exclude<Orphaned, 'field'> | 'unwritable';

/** The units an image was replaced on, and those skipped, with why. */
export type ImagesReplaced = {
  replaced: ImageRef[];
  skipped: { ref: ImageRef; reason: ImageSkip }[];
};

export type SceneNode = { id: string; title: string };
export type ChapterNode = { id: string; title: string; scenes: SceneNode[] };
/** A Part: its Chapters by id, in order; the Chapters themselves are in the tree's `chapters`. */
export type PartNode = { id: string; title: string; chapters: string[] };
/** A Book: the order of its Parts and Loose Chapters, by id. */
export type BookNode = { id: string; title: string; top: string[] };
/**
 * The Manuscript's structure as `project.json` holds it. `chapters` is every
 * Chapter, in reading order, which is all an app without Parts reads. Once
 * the Project has a Part, `parts` holds them and `top` the order of the Parts
 * and Loose Chapters; a Chapter in neither is Unplaced. Without Parts, both
 * are absent and every Chapter is loose, in the order of `chapters`.
 *
 * A Series also has `books` (ADR 0012), each with the order of its Parts and
 * Loose Chapters, which decide the order; `top` is then only every Book's
 * order one after another, for an app without Books. A Project with one
 * Book has no `books`.
 */
export type ProjectTree = {
  chapters: ChapterNode[];
  parts?: PartNode[];
  top?: string[];
  books?: BookNode[];
};

/** What the Project calls its Parts: only a label (a Project setting). */
export type PartLabel = 'part' | 'act' | 'episode';
export const PART_LABELS: { label: PartLabel; name: string; plural: string }[] =
  [
    { label: 'part', name: 'Part', plural: 'Parts' },
    { label: 'act', name: 'Act', plural: 'Acts' },
    { label: 'episode', name: 'Episode', plural: 'Episodes' },
  ];

/** Reads a Project's Part label: Part unless it says Act or Episode. */
export function partLabel(raw: unknown): PartLabel {
  return raw === 'act' || raw === 'episode' ? raw : 'part';
}

/** What a Part is called in a Project with `label`, as in “Act”, or “Acts” when `plural`. */
export function partName(label: PartLabel | undefined, plural = false): string {
  const found = PART_LABELS.find((l) => l.label === (label ?? 'part'))!;
  return plural ? found.plural : found.name;
}

/**
 * The Manuscript as the binder shows it: the tree from `project.json`, with
 * Scenes whose file is missing marked, and Scene files the tree doesn't place.
 */
export type Manuscript = {
  /**
   * Every Chapter in reading order: the Loose Chapters and the Parts'
   * Chapters as `top` orders them, then the Unplaced Chapters.
   */
  chapters: ManuscriptChapter[];
  /** The Parts, in order; absent when the Project has none. */
  parts?: ManuscriptPart[];
  /**
   * The ids of the Parts and Loose Chapters, in order, every Book's one
   * after another; absent when the Project has no Parts and is no Series,
   * when every Chapter is loose.
   */
  top?: string[];
  /** The Books, in reading order; absent unless the Project is a Series. */
  books?: ManuscriptBook[];
  unplaced: ManuscriptScene[];
  /** The Manuscript's Word target, as the Project Outline's file holds it. */
  wordTarget?: number;
  /** What the Project calls its Parts; Part when absent. */
  partLabel?: PartLabel;
};
/** A Book of a Series, with its Parts and Loose Chapters by id and its details, as a Part has them. */
export type ManuscriptBook = {
  id: string;
  title: string;
  top: string[];
  status?: string;
  tags?: string[];
  image?: string;
  wordTarget?: number;
};
/** A Part, with its Chapters by id and its details, as a Chapter has them. */
export type ManuscriptPart = {
  id: string;
  title: string;
  chapters: string[];
  /** The id of the Book it is in; absent unless the Project is a Series. */
  book?: string;
  status?: string;
  tags?: string[];
  image?: string;
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
  /** The id of the Part it is in; absent for a Loose or Unplaced Chapter. */
  part?: string;
  /** The id of the Book it is in; absent unless the Project is a Series, and for an Unplaced Chapter. */
  book?: string;
  /** In no Part and nowhere in the top-level order: shown after the rest. */
  unplaced?: true;
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
 * Where units taken out of the story are kept: Trash, until the Author
 * empties it, or the Drawer, which is never emptied.
 */
export type Place = 'trash' | 'drawer';

/** The kinds that can be moved to Trash or the Drawer by id. */
export type MovableKind =
  | 'scene'
  | 'chapter'
  | 'part'
  | 'book'
  | 'entry'
  | 'conversation';

/**
 * A deleted Scene or Chapter, or a version of a unit set aside when its
 * Conflict was resolved, recoverable until Trash is emptied. A Scene names the
 * Chapter it was deleted from, if it had one; a Chapter lists the Scenes
 * deleted with it, a Part the Chapters, and a Book its Parts and Loose Chapters. A version's `title` names its unit, as in “Opening” or the
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
      kind: 'part';
      id: string;
      title: string;
      trashedAt: number;
      chapters: { id: string; title: string; scenes: SceneNode[] }[];
    }
  | {
      /** A Book, with its Parts and its Loose Chapters. */
      kind: 'book';
      id: string;
      title: string;
      trashedAt: number;
      parts: {
        id: string;
        title: string;
        chapters: { id: string; title: string; scenes: SceneNode[] }[];
      }[];
      chapters: { id: string; title: string; scenes: SceneNode[] }[];
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
    }
  | {
      /** A Custom field, its `title` its label; its values stay in the Entries. */
      kind: 'custom-field';
      id: string;
      title: string;
      trashedAt: number;
      type: EntryType;
    }
  | {
      /** A Snapshot of a Scene's Prose, its `title` its name. */
      kind: 'snapshot';
      id: string;
      title: string;
      trashedAt: number;
      /** The title of the Scene it belongs to. */
      sceneTitle: string;
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
