import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
} from '../shared/project-types';
import { partOf, topItems, unplacedChapters } from '../shared/manuscript-order';

/** What the Overview pane beside the Prose lists: the Chapter being written, or the whole Project. */
export type OverviewScope = 'chapter' | 'project';

/** The row, or Corkboard lane, of the Scenes that have no place in the Manuscript's order. */
export const UNPLACED = 'unplaced';

/** The Scene being written, and its Chapter, null for an Unplaced Scene. */
export type Writing = { sceneId: string; chapterId: string | null };

/** The Chapter being written, or the Project when the Scene has no Chapter. */
export function defaultScope(writing: Writing): OverviewScope {
  return writing.chapterId ? 'chapter' : 'project';
}

/**
 * The rows that list their Scenes, or a Part's its Chapters, as the pane
 * shows a scope, every row's Outline and Notes closed: in Project scope,
 * the Chapter being written and its Part, or the Unplaced Scenes. In
 * Chapter scope its Scenes are always listed.
 */
export function startListed(
  scope: OverviewScope,
  writing: Writing,
  manuscript?: Manuscript,
): ReadonlySet<string> {
  if (scope === 'chapter') return new Set();
  const part =
    manuscript && writing.chapterId
      ? partOf(manuscript, writing.chapterId)
      : undefined;
  return new Set([writing.chapterId ?? UNPLACED, ...(part ? [part.id] : [])]);
}

/**
 * The rows Expand all opens, in order: in Chapter scope that Chapter's, in
 * Project scope every one, and each Part lists its Chapters, and each
 * Chapter and the Unplaced Scenes their Scenes. Never the Scene being
 * written, whose Outline & Notes are above the Prose, nor a missing Scene.
 */
export function expandable(
  manuscript: Manuscript,
  scope: OverviewScope,
  writing: Writing,
): string[] {
  const scenes = (list: ManuscriptScene[]) =>
    list.filter((s) => s.id !== writing.sceneId && !s.missing).map((s) => s.id);
  const chapterIds = (c: ManuscriptChapter) => [c.id, ...scenes(c.scenes)];
  if (scope === 'chapter') {
    const chapter = manuscript.chapters.find((c) => c.id === writing.chapterId);
    return chapter ? chapterIds(chapter) : [];
  }
  return [
    PROJECT_OUTLINE,
    ...topItems(manuscript).flatMap((item) =>
      item.kind === 'part'
        ? [item.part.id, ...item.chapters.flatMap(chapterIds)]
        : chapterIds(item.chapter),
    ),
    ...unplacedChapters(manuscript).flatMap(chapterIds),
    ...(manuscript.unplaced.length > 0
      ? [UNPLACED, ...scenes(manuscript.unplaced)]
      : []),
  ];
}

/** An Outline's first line with text, without its bullet: what a closed row shows. */
export function firstLine(body: string): string {
  return (
    body
      .split('\n')
      .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
      .find(Boolean) ?? ''
  );
}
