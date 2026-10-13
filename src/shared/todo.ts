import type { EntrySummary, Manuscript, TrashItem } from './project-types';

/** What a Todo may link to: one Scene, Chapter, Part, Book or Entry. */
export type TodoLink = {
  kind: 'scene' | 'chapter' | 'part' | 'book' | 'entry';
  id: string;
};

const LINK_KINDS: readonly unknown[] = [
  'scene',
  'chapter',
  'part',
  'book',
  'entry',
];

/** Whether `value` is a link to a Scene, Chapter, Part, Book or Entry by its id. */
export function isTodoLink(value: unknown): value is TodoLink {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, id } = value as Record<string, unknown>;
  return LINK_KINDS.includes(kind) && typeof id === 'string';
}

/** What a link is looked up in: the units in the Project, and those in Trash or the Drawer. */
export type LinkNames = {
  manuscript: Manuscript;
  entries: EntrySummary[];
  trash: TrashItem[];
  drawer: TrashItem[];
};

/** One Todo, as the window shows it. */
export type Todo = {
  id: string;
  /** One line. */
  text: string;
  done: boolean;
  link?: TodoLink;
};

/**
 * The Todos This context shows for the unit open, `link`: those linked to it
 * and to the units containing it, a Scene's Chapter, Part and Book, a
 * Chapter's Part and Book, or a Part's Book, in the Author's order; none with
 * nothing open.
 */
export function inContext(
  todos: Todo[],
  link: TodoLink | null,
  manuscript: Manuscript,
): Todo[] {
  if (!link) return [];
  const units = [link];
  const chapter =
    link.kind === 'chapter'
      ? manuscript.chapters.find((c) => c.id === link.id)
      : link.kind === 'scene'
        ? manuscript.chapters.find((c) =>
            c.scenes.some((s) => s.id === link.id),
          )
        : undefined;
  if (chapter && link.kind === 'scene') {
    units.push({ kind: 'chapter', id: chapter.id });
  }
  if (chapter?.part) units.push({ kind: 'part', id: chapter.part });
  const book =
    link.kind === 'part'
      ? manuscript.parts?.find((p) => p.id === link.id)?.book
      : chapter?.book;
  if (book) units.push({ kind: 'book', id: book });
  return todos.filter((todo) =>
    units.some(
      (unit) => todo.link?.kind === unit.kind && todo.link.id === unit.id,
    ),
  );
}

/** What changing a Todo sets: its text, its tick, or its link, which null drops. */
export type TodoChange = {
  text?: string;
  done?: boolean;
  link?: TodoLink | null;
};

/**
 * A link as the Todo shows it: the unit's title, and while the unit is in
 * Trash, or `drawer`, the id of the item that holds it (a Scene's Chapter's,
 * if the Scene went with it, or the Part's or Book's, if the Chapter did).
 */
export type LinkView = { title: string; trashId?: string; drawer?: true };

/**
 * How a Todo shows its link; null once the unit is neither in the Project
 * nor in Trash or the Drawer, as after Trash is emptied on another computer,
 * when the Todo shows as plain text.
 */
export function linkView(
  link: TodoLink,
  { manuscript, entries, trash, drawer }: LinkNames,
): LinkView | null {
  const { kind, id } = link;
  if (kind === 'entry') {
    const entry = entries.find((e) => e.id === id);
    if (entry) return { title: entry.name };
  } else if (kind === 'chapter') {
    const chapter = manuscript.chapters.find((c) => c.id === id);
    if (chapter) return { title: chapter.title };
  } else if (kind === 'part') {
    const part = manuscript.parts?.find((p) => p.id === id);
    if (part) return { title: part.title };
  } else if (kind === 'book') {
    const book = manuscript.books?.find((b) => b.id === id);
    if (book) return { title: book.title };
  } else {
    const scene = [
      ...manuscript.chapters.flatMap((c) => c.scenes),
      ...manuscript.unplaced,
    ].find((s) => s.id === id);
    if (scene) return { title: scene.title };
  }
  const kept = keptView(link, trash);
  if (kept) return kept;
  const drawered = keptView(link, drawer);
  return drawered && { ...drawered, drawer: true };
}

/** A link to a unit in one of `items`, Trash's or the Drawer's, as `linkView`. */
function keptView({ kind, id }: TodoLink, items: TrashItem[]): LinkView | null {
  for (const item of items) {
    if (item.kind === kind && item.id === id) {
      return { title: item.title, trashId: item.id };
    }
    if (kind === 'scene' && item.kind === 'chapter') {
      const scene = item.scenes.find((s) => s.id === id);
      if (scene) return { title: scene.title, trashId: item.id };
    }
    if (item.kind === 'part' || item.kind === 'book') {
      const parts = item.kind === 'book' ? item.parts : [item];
      const chapters = [
        ...(item.kind === 'book' ? item.chapters : []),
        ...parts.flatMap((p) => p.chapters),
      ];
      const units =
        kind === 'part'
          ? parts.filter((p) => p.id !== item.id)
          : kind === 'chapter'
            ? chapters
            : kind === 'scene'
              ? chapters.flatMap((c) => c.scenes)
              : [];
      const unit = units.find((u) => u.id === id);
      if (unit) return { title: unit.title, trashId: item.id };
    }
  }
  return null;
}
