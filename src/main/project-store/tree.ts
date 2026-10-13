import type {
  BookNode,
  ChapterNode,
  PartNode,
  ProjectTree,
  SceneNode,
} from '../../shared/project-types';

export function sceneIds(tree: ProjectTree): string[] {
  return tree.chapters.flatMap((chapter) => chapter.scenes.map((s) => s.id));
}

export function findChapter(tree: ProjectTree, chapterId: string): ChapterNode {
  const chapter = tree.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new Error(`No Chapter ${chapterId}`);
  return chapter;
}

export function findPart(tree: ProjectTree, partId: string): PartNode {
  const part = tree.parts?.find((p) => p.id === partId);
  if (!part) throw new Error(`No Part ${partId}`);
  return part;
}

export function isPart(tree: ProjectTree, id: string): boolean {
  return tree.parts?.some((p) => p.id === id) ?? false;
}

export function tryFindScene(
  tree: ProjectTree,
  sceneId: string,
): { chapter: ChapterNode; scene: SceneNode } | null {
  for (const chapter of tree.chapters) {
    const scene = chapter.scenes.find((s) => s.id === sceneId);
    if (scene) return { chapter, scene };
  }
  return null;
}

/**
 * The id of the one Book of a Project that is no Series, as a full tree
 * holds it; never written, since such a Project has no `books`.
 */
export const ONLY_BOOK = '';

/** The Books `project.json` holds, which a Series has; none otherwise. */
function booksIn(tree: ProjectTree): BookNode[] {
  if (!Array.isArray(tree.books)) return [];
  const seen = new Set<string>();
  return tree.books.filter((book) => {
    const fine =
      typeof book?.id === 'string' && book.id !== '' && !seen.has(book.id);
    if (fine) seen.add(book.id);
    return fine;
  });
}

/** Whether the Project holds more than its one Book: a Series. */
export function isSeries(tree: ProjectTree): boolean {
  return booksIn(tree).length > 0;
}

export function findBook(tree: ProjectTree, bookId: string): BookNode {
  const book = booksIn(tree).find((b) => b.id === bookId);
  if (!book) throw new Error(`No Book ${bookId}`);
  return book;
}

export function isBook(tree: ProjectTree, id: string): boolean {
  return booksIn(tree).some((b) => b.id === id);
}

/** One item of a Book's top level: a Part with its Chapters, or a Loose Chapter. */
export type TopItem =
  | { part: PartNode; chapters: ChapterNode[] }
  | { chapter: ChapterNode };

/** A Book with its top level read. */
export type BookItem = { book: BookNode; top: TopItem[] };

/**
 * The tree read as Books, Parts and Chapters: each Book with its top level
 * in order, the top level of all of them one after another, and the
 * Unplaced Chapters, in the order of `chapters`. A Project that is no Series
 * reads as one Book, `ONLY_BOOK`, whose top level is `top`; without Parts
 * every Chapter is loose. Ids that name nothing are passed over, a Part or
 * Chapter is placed once, where it is first named, but in a Part rather than
 * loose, and a Part no Book places goes at the end of the last: an app
 * without Parts or Books may have changed the tree since.
 */
export function structureOf(tree: ProjectTree): {
  books: BookItem[];
  top: TopItem[];
  unplaced: ChapterNode[];
} {
  const parts = tree.parts ?? [];
  const series = booksIn(tree);
  if (parts.length === 0 && series.length === 0) {
    const top = tree.chapters.map((chapter) => ({ chapter }));
    const book = { id: ONLY_BOOK, title: '', top: tree.chapters.map(idOf) };
    return { books: [{ book, top }], top, unplaced: [] };
  }
  const books =
    series.length > 0
      ? series
      : [{ id: ONLY_BOOK, title: '', top: tree.top ?? [] }];
  const chapters = new Map(tree.chapters.map((c) => [c.id, c]));
  const used = new Set<string>();
  const take = (id: string): ChapterNode[] => {
    const chapter = chapters.get(id);
    if (!chapter || used.has(id)) return [];
    used.add(id);
    return [chapter];
  };
  // An app without Books moves a Chapter into a Part without changing them.
  const inParts = new Set(parts.flatMap((p) => p.chapters));
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const placedParts = new Set<string>();
  const partItem = (part: PartNode): TopItem => {
    placedParts.add(part.id);
    return { part, chapters: part.chapters.flatMap(take) };
  };
  const items: BookItem[] = books.map((book) => ({
    book,
    top: (Array.isArray(book.top) ? book.top : []).flatMap((id): TopItem[] => {
      const part = partsById.get(id);
      if (part) return placedParts.has(id) ? [] : [partItem(part)];
      if (inParts.has(id)) return [];
      return take(id).map((chapter) => ({ chapter }));
    }),
  }));
  const last = items[items.length - 1];
  for (const part of parts) {
    if (!placedParts.has(part.id)) last.top.push(partItem(part));
  }
  return {
    books: items,
    top: items.flatMap((item) => item.top),
    unplaced: tree.chapters.filter((c) => !used.has(c.id)),
  };
}

function idOf(node: { id: string }): string {
  return node.id;
}

function topId(item: TopItem): string {
  return 'part' in item ? item.part.id : item.chapter.id;
}

/**
 * A tree with `parts` and `books` always there, as structure operations
 * change it; a Project that is no Series has the one Book `ONLY_BOOK`. Its
 * `top` isn't kept: the Books' are.
 */
export type FullTree = Omit<ProjectTree, 'top'> & {
  parts: PartNode[];
  books: BookNode[];
};

/** The tree with its structure spelt out: what `structureOf` reads, as ids. */
export function expanded(tree: ProjectTree): FullTree {
  const { books, top, unplaced } = structureOf(tree);
  const parts: PartNode[] = [];
  for (const item of top) {
    if ('part' in item) {
      parts.push({ ...item.part, chapters: item.chapters.map(idOf) });
    }
  }
  const { top: _, ...rest } = tree;
  return {
    ...rest,
    chapters: [...readingOrder(top), ...unplaced],
    parts,
    books: books.map(({ book, top }) => ({ ...book, top: top.map(topId) })),
  };
}

/**
 * A full tree as `project.json` holds it: `chapters` in reading order, then
 * the Unplaced. Without Parts, `parts` and `top` go; with them, `top` is
 * every Book's top level, one after another. A Project that is no Series
 * has no `books`.
 */
export function settled(full: FullTree): ProjectTree {
  const {
    parts: _,
    books: _b,
    top: _t,
    ...base
  } = full as FullTree & { top?: unknown };
  const byId = new Map(full.chapters.map((c) => [c.id, c]));
  const parts = new Map(full.parts.map((p) => [p.id, p]));
  const top = full.books.flatMap((book) => book.top);
  const reading = top
    .flatMap((id) => parts.get(id)?.chapters ?? [id])
    .map((id) => byId.get(id))
    .filter((chapter) => chapter !== undefined);
  const placed = new Set(reading.map((c) => c.id));
  const chapters = [
    ...reading,
    ...full.chapters.filter((c) => !placed.has(c.id)),
  ];
  const series = full.books.some((book) => book.id !== ONLY_BOOK);
  return {
    ...base,
    chapters,
    ...(full.parts.length > 0 && { parts: full.parts, top }),
    ...(series && { books: full.books }),
  };
}

function readingOrder(top: TopItem[]): ChapterNode[] {
  return top.flatMap((item) =>
    'part' in item ? item.chapters : [item.chapter],
  );
}

/** The top level of a Book of a full tree, or of its first if it has no Book `bookId`. */
export function bookTop(full: FullTree, bookId?: string): string[] {
  return (full.books.find((b) => b.id === bookId) ?? full.books[0]).top;
}

/** The Book whose top level holds a Part or Loose Chapter; none for an Unplaced Chapter. */
export function bookHolding(full: FullTree, id: string): BookNode | undefined {
  return full.books.find((book) => book.top.includes(id));
}

/**
 * Where a Chapter is placed in a full tree: in a Part, or among its Book's
 * Parts and Loose Chapters, or nowhere.
 */
export function placeOf(
  full: FullTree,
  chapterId: string,
): { book: string; part?: string; index: number } | null {
  for (const book of full.books) {
    const index = book.top.indexOf(chapterId);
    if (index >= 0) return { book: book.id, index };
  }
  for (const part of full.parts) {
    const i = part.chapters.indexOf(chapterId);
    if (i >= 0) {
      const book = bookHolding(full, part.id)?.id ?? ONLY_BOOK;
      return { book, part: part.id, index: i };
    }
  }
  return null;
}

/** Takes a Chapter out of its place, leaving it Unplaced; resolves with where it was. */
export function unplace(
  full: FullTree,
  chapterId: string,
): { book: string; part?: string; index: number } | null {
  const place = placeOf(full, chapterId);
  if (!place) return null;
  if (place.part === undefined)
    bookTop(full, place.book).splice(place.index, 1);
  else findPart(full, place.part).chapters.splice(place.index, 1);
  return place;
}

/**
 * Places a Chapter at `index` in a Part, or with no `part`, among the Parts
 * and Loose Chapters of Book `book`, or of the first Book.
 */
export function place(
  full: FullTree,
  chapterId: string,
  index: number,
  part?: string,
  book?: string,
): void {
  const list =
    part === undefined ? bookTop(full, book) : findPart(full, part).chapters;
  list.splice(Math.max(0, Math.min(index, list.length)), 0, chapterId);
}

/** Takes a Part or Loose Chapter out of its Book's top level; resolves with where it was. */
export function takeFromBook(
  full: FullTree,
  id: string,
): { book: string; index: number } | null {
  const book = bookHolding(full, id);
  if (!book) return null;
  const index = book.top.indexOf(id);
  book.top.splice(index, 1);
  return { book: book.id, index };
}

/**
 * Makes a full tree of a Project that is no Series hold its one Book as
 * Book 1 of a Series; resolves with the first Book's id.
 */
export function asSeries(full: FullTree, newId: () => string): string {
  const only = full.books.find((book) => book.id === ONLY_BOOK);
  if (only) Object.assign(only, { id: newId(), title: 'Book 1' });
  return full.books[0].id;
}
