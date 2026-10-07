import type { EntrySummary, Manuscript, TrashItem } from './project-types';

/** What a Todo may link to: one Scene, Chapter or Entry. */
export type TodoLink = { kind: 'scene' | 'chapter' | 'entry'; id: string };

const LINK_KINDS: readonly unknown[] = ['scene', 'chapter', 'entry'];

/** Whether `value` is a link to a Scene, Chapter or Entry by its id. */
export function isTodoLink(value: unknown): value is TodoLink {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, id } = value as Record<string, unknown>;
  return LINK_KINDS.includes(kind) && typeof id === 'string';
}

/** What a link is looked up in: the units in the Project, and those in Trash. */
export type LinkNames = {
  manuscript: Manuscript;
  entries: EntrySummary[];
  trash: TrashItem[];
};

/** One Todo, as the window shows it. */
export type Todo = {
  id: string;
  /** One line. */
  text: string;
  done: boolean;
  link?: TodoLink;
};

/** The Todos linked to `link`, as “Only the open unit’s Todos” shows; none without one. */
export function linkedTo(todos: Todo[], link: TodoLink | null): Todo[] {
  if (!link) return [];
  return todos.filter(
    (todo) => todo.link?.kind === link.kind && todo.link.id === link.id,
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
 * Trash, the id of the Trash item that holds it (a Scene's Chapter's, if the
 * Scene went with it).
 */
export type LinkView = { title: string; trashId?: string };

/**
 * How a Todo shows its link; null once the unit is neither in the Project
 * nor in Trash, as after Trash is emptied on another computer, when the Todo
 * shows as plain text.
 */
export function linkView(
  link: TodoLink,
  { manuscript, entries, trash }: LinkNames,
): LinkView | null {
  const { kind, id } = link;
  if (kind === 'entry') {
    const entry = entries.find((e) => e.id === id);
    if (entry) return { title: entry.name };
  } else if (kind === 'chapter') {
    const chapter = manuscript.chapters.find((c) => c.id === id);
    if (chapter) return { title: chapter.title };
  } else {
    const scene = [
      ...manuscript.chapters.flatMap((c) => c.scenes),
      ...manuscript.unplaced,
    ].find((s) => s.id === id);
    if (scene) return { title: scene.title };
  }
  for (const item of trash) {
    if (item.kind === kind && item.id === id) {
      return { title: item.title, trashId: item.id };
    }
    if (kind === 'scene' && item.kind === 'chapter') {
      const scene = item.scenes.find((s) => s.id === id);
      if (scene) return { title: scene.title, trashId: item.id };
    }
  }
  return null;
}
