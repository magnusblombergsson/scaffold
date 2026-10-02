import {
  PROJECT_OUTLINE,
  type Manuscript,
  type UnitRef,
} from './project-types';

/** How the Author is told which unit something is about, as in "Can't save …". */
export function unitName(ref: UnitRef, manuscript: Manuscript): string {
  if (ref.kind === 'outline' && ref.id === PROJECT_OUTLINE) {
    return 'the Project Outline';
  }
  const title = titleOf(ref.id, manuscript);
  if (ref.kind === 'scene') return title ? `“${title}”` : 'a Scene';
  if (ref.kind === 'outline') {
    return title ? `the Outline of “${title}”` : 'an Outline';
  }
  return title ? `the Notes on “${title}”` : 'some Notes';
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleOf(id: string, manuscript: Manuscript): string | undefined {
  for (const chapter of manuscript.chapters) {
    if (chapter.id === id) return chapter.title;
    const scene = chapter.scenes.find((s) => s.id === id);
    if (scene) return scene.title;
  }
  return manuscript.unplaced.find((s) => s.id === id)?.title;
}
