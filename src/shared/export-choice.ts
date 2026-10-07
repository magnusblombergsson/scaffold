import { filterManuscript, type Filter } from './filter';
import type { Manuscript, ManuscriptChapter } from './project-types';
import type { Status } from './status';

// What an Export holds, as the Author chooses it. For the Manuscript, the
// Scenes and Chapters they tick: only what they left unticked is kept, so a
// unit created since the last Export starts ticked.

/** The ids of the Chapters and Scenes the Author left unticked. */
export type ExportUnticked = { chapters: string[]; scenes: string[] };

/** Everything ticked. */
export const TICK_ALL: ExportUnticked = { chapters: [], scenes: [] };

/**
 * Only what `filter` matches ticked, as the Outline skeleton would show it:
 * a matching Chapter with all its Scenes, otherwise just its matching Scenes.
 */
export function tickMatching(
  manuscript: Manuscript,
  filter: Filter,
  statuses: readonly Status[],
): ExportUnticked {
  const shown = filterManuscript(filter, manuscript, statuses).chapters;
  const ticked = new Set(
    shown.flatMap(({ chapter, scenes }) => [
      chapter.id,
      ...scenes.map((s) => s.id),
    ]),
  );
  return {
    chapters: manuscript.chapters
      .filter((c) => !ticked.has(c.id))
      .map((c) => c.id),
    scenes: manuscript.chapters
      .flatMap((c) => c.scenes)
      .filter((s) => !ticked.has(s.id))
      .map((s) => s.id),
  };
}

/** A Chapter's box: half-ticked when only some of its Scenes are ticked. */
export type Tick = 'ticked' | 'half' | 'unticked';

export function sceneTicked(id: string, unticked: ExportUnticked): boolean {
  return !unticked.scenes.includes(id);
}

/** A Chapter with Scenes is ticked by them; an empty one by its own box. */
export function chapterTick(
  chapter: ManuscriptChapter,
  unticked: ExportUnticked,
): Tick {
  if (chapter.scenes.length === 0) {
    return unticked.chapters.includes(chapter.id) ? 'unticked' : 'ticked';
  }
  const ticked = chapter.scenes.filter((s) => sceneTicked(s.id, unticked));
  if (ticked.length === chapter.scenes.length) return 'ticked';
  return ticked.length === 0 ? 'unticked' : 'half';
}

/** Unticks a ticked Chapter with all its Scenes; ticks any other with all of them. */
export function toggleChapter(
  chapter: ManuscriptChapter,
  unticked: ExportUnticked,
): ExportUnticked {
  const tick = chapterTick(chapter, unticked) !== 'ticked';
  const sceneIds = chapter.scenes.map((s) => s.id);
  return {
    chapters: chaptersWith(unticked, chapter.id, tick),
    scenes: [
      ...unticked.scenes.filter((id) => !sceneIds.includes(id)),
      ...(tick ? [] : sceneIds),
    ],
  };
}

/**
 * Ticks or unticks one Scene of `chapter`. The Chapter's own box follows, so
 * that it stays unticked if it is later left empty with none of them ticked.
 */
export function toggleScene(
  chapter: ManuscriptChapter,
  sceneId: string,
  unticked: ExportUnticked,
): ExportUnticked {
  const scenes = sceneTicked(sceneId, unticked)
    ? [...unticked.scenes, sceneId]
    : unticked.scenes.filter((id) => id !== sceneId);
  const anyTicked = chapter.scenes.some((s) => !scenes.includes(s.id));
  return { chapters: chaptersWith(unticked, chapter.id, anyTicked), scenes };
}

/** The unticked Chapters, with the Chapter `id` ticked or not. */
function chaptersWith(
  unticked: ExportUnticked,
  id: string,
  ticked: boolean,
): string[] {
  return [
    ...unticked.chapters.filter((other) => other !== id),
    ...(ticked ? [] : [id]),
  ];
}

/**
 * The Manuscript as far as it is ticked: each Chapter with any ticked Scenes
 * holds only those, a Chapter with none is left out, and an empty Chapter
 * goes in only when its own box is ticked. Unplaced Scenes never go in.
 */
export function pickedManuscript(
  manuscript: Manuscript,
  unticked: ExportUnticked,
): Manuscript {
  return {
    chapters: manuscript.chapters.flatMap((chapter) => {
      if (chapterTick(chapter, unticked) === 'unticked') return [];
      return [
        {
          ...chapter,
          scenes: chapter.scenes.filter((s) => sceneTicked(s.id, unticked)),
        },
      ];
    }),
    unplaced: [],
  };
}

/**
 * What a Story Bible Export holds: the Entries `filter` matches, all with
 * none on, and their images and private notes if chosen.
 */
export type StoryBibleChoice = {
  filter: Filter;
  images: boolean;
  privateNotes: boolean;
};
