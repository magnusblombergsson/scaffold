import type { Dropped } from '../shared/api';
import { partName, type PartLabel } from '../shared/project-types';

/**
 * How a version of a unit in Conflict, or in Trash, is labelled: by the
 * computer that saved it, when known, and when it did.
 */
export function versionLabel({
  host,
  original,
  savedAt,
}: {
  host?: string;
  original?: boolean;
  savedAt: number;
}): string {
  const who = original
    ? host
      ? `${host}, current version`
      : 'Current version'
    : (host ?? 'Another computer');
  const when = new Date(savedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${who} · ${when}`;
}

/** What the Author is told, once, when one computer's `project.json` lost to another's. */
export function droppedMessage(
  { host, chapters, scenes, parts: droppedParts = [], books = [] }: Dropped,
  label?: PartLabel,
): string {
  const parts = [
    `The Manuscript was rearranged on two computers at once; the order from ${host ?? 'another computer'} was set aside.`,
  ];
  if (books.length > 0) {
    parts.push(
      `Dropped: ${books.length === 1 ? 'Book' : 'Books'} ${quoted(books)}.`,
    );
  }
  if (droppedParts.length > 0) {
    parts.push(
      `Dropped: ${partName(label, droppedParts.length > 1)} ${quoted(droppedParts)}.`,
    );
  }
  if (chapters.length > 0) {
    parts.push(
      `Dropped: ${chapters.length === 1 ? 'Chapter' : 'Chapters'} ${quoted(chapters)}.`,
    );
  }
  if (scenes.length > 0) parts.push(`Now Unplaced: ${quoted(scenes)}.`);
  return parts.join(' ');
}

function quoted(titles: string[]): string {
  return titles.map((title) => `“${title}”`).join(', ');
}
