import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptScene,
} from '../shared/project-types';

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
 * The rows that list their Scenes as the pane shows a scope, every row's
 * Outline and Notes closed: in Project scope, the Chapter being written, or
 * the Unplaced Scenes. In Chapter scope its Scenes are always listed.
 */
export function startListed(
  scope: OverviewScope,
  writing: Writing,
): ReadonlySet<string> {
  return new Set(scope === 'chapter' ? [] : [writing.chapterId ?? UNPLACED]);
}

/**
 * The rows Expand all opens, in order: in Chapter scope that Chapter's, in
 * Project scope every one, and each Chapter and the Unplaced Scenes list
 * their Scenes. Never the
 * Scene being written, whose Outline & Notes are above the Prose, nor a
 * missing Scene.
 */
export function expandable(
  manuscript: Manuscript,
  scope: OverviewScope,
  writing: Writing,
): string[] {
  const scenes = (list: ManuscriptScene[]) =>
    list.filter((s) => s.id !== writing.sceneId && !s.missing).map((s) => s.id);
  const chapters = manuscript.chapters.filter(
    (c) => scope === 'project' || c.id === writing.chapterId,
  );
  const ids = chapters.flatMap((c) => [c.id, ...scenes(c.scenes)]);
  if (scope === 'chapter') return ids;
  return [
    PROJECT_OUTLINE,
    ...ids,
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
