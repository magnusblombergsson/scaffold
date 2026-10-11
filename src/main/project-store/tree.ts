import type {
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

/** One item of the Manuscript's top level: a Part with its Chapters, or a Loose Chapter. */
export type TopItem =
  | { part: PartNode; chapters: ChapterNode[] }
  | { chapter: ChapterNode };

/**
 * The tree read as Parts and Chapters: the top level in order, and the
 * Unplaced Chapters, in the order of `chapters`. Without Parts every Chapter
 * is loose. Ids that name nothing are passed over, a Chapter is placed once,
 * where it is first named, and a Part `top` doesn't place goes at its end:
 * an app without Parts may have changed `chapters` since.
 */
export function structureOf(tree: ProjectTree): {
  top: TopItem[];
  unplaced: ChapterNode[];
} {
  const parts = tree.parts ?? [];
  if (parts.length === 0) {
    return { top: tree.chapters.map((chapter) => ({ chapter })), unplaced: [] };
  }
  const chapters = new Map(tree.chapters.map((c) => [c.id, c]));
  const used = new Set<string>();
  const take = (id: string): ChapterNode[] => {
    const chapter = chapters.get(id);
    if (!chapter || used.has(id)) return [];
    used.add(id);
    return [chapter];
  };
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const placedParts = new Set<string>();
  const top: TopItem[] = [];
  const placePart = (part: PartNode) => {
    placedParts.add(part.id);
    top.push({ part, chapters: part.chapters.flatMap(take) });
  };
  for (const id of tree.top ?? []) {
    const part = partsById.get(id);
    if (part) {
      if (!placedParts.has(id)) placePart(part);
    } else {
      top.push(...take(id).map((chapter) => ({ chapter })));
    }
  }
  for (const part of parts) if (!placedParts.has(part.id)) placePart(part);
  return {
    top,
    unplaced: tree.chapters.filter((c) => !used.has(c.id)),
  };
}

/** A tree with `parts` and `top` always there, as structure operations change it. */
export type FullTree = ProjectTree & { parts: PartNode[]; top: string[] };

/** The tree with its structure spelt out: what `structureOf` reads, as ids. */
export function expanded(tree: ProjectTree): FullTree {
  const { top, unplaced } = structureOf(tree);
  const parts: PartNode[] = [];
  for (const item of top) {
    if ('part' in item) {
      parts.push({ ...item.part, chapters: item.chapters.map((c) => c.id) });
    }
  }
  return {
    ...tree,
    chapters: [...readingOrder(top), ...unplaced],
    parts,
    top: top.map((item) => ('part' in item ? item.part.id : item.chapter.id)),
  };
}

/**
 * A full tree as `project.json` holds it: `chapters` in reading order, then
 * the Unplaced. Without Parts, `parts` and `top` go, and every Chapter is
 * loose, the Unplaced last.
 */
export function settled(full: FullTree): ProjectTree {
  const { parts: _, top: _t, ...base } = full;
  const byId = new Map(full.chapters.map((c) => [c.id, c]));
  const parts = new Map(full.parts.map((p) => [p.id, p]));
  const reading = full.top
    .flatMap((id) => parts.get(id)?.chapters ?? [id])
    .map((id) => byId.get(id))
    .filter((chapter) => chapter !== undefined);
  const placed = new Set(reading.map((c) => c.id));
  const chapters = [
    ...reading,
    ...full.chapters.filter((c) => !placed.has(c.id)),
  ];
  if (full.parts.length === 0) return { ...base, chapters };
  return { ...base, chapters, parts: full.parts, top: full.top };
}

function readingOrder(top: TopItem[]): ChapterNode[] {
  return top.flatMap((item) =>
    'part' in item ? item.chapters : [item.chapter],
  );
}

/** Where a Chapter is placed in a full tree: in a Part, at the top, or nowhere. */
export function placeOf(
  full: FullTree,
  chapterId: string,
): { part?: string; index: number } | null {
  const index = full.top.indexOf(chapterId);
  if (index >= 0) return { index };
  for (const part of full.parts) {
    const i = part.chapters.indexOf(chapterId);
    if (i >= 0) return { part: part.id, index: i };
  }
  return null;
}

/** Takes a Chapter out of its place, leaving it Unplaced; resolves with where it was. */
export function unplace(
  full: FullTree,
  chapterId: string,
): { part?: string; index: number } | null {
  const place = placeOf(full, chapterId);
  if (!place) return null;
  if (place.part === undefined) full.top.splice(place.index, 1);
  else findPart(full, place.part).chapters.splice(place.index, 1);
  return place;
}

/** Places a Chapter at `index` in a Part, or at the top with no `part`. */
export function place(
  full: FullTree,
  chapterId: string,
  index: number,
  part?: string,
): void {
  const list = part === undefined ? full.top : findPart(full, part).chapters;
  list.splice(Math.max(0, Math.min(index, list.length)), 0, chapterId);
}
