import { createContext, useContext, useMemo } from 'react';
import {
  storyBibleAsOf,
  type LensSource,
  type StoryBibleLens,
} from '../shared/story-bible-as-of';

/** What every lens in the window is made from: the Project's Books, Entries and Relations as they are now. */
export const StoryBibleContext = createContext<LensSource | null>(null);

/**
 * The Story Bible as of `book`, or of the whole Project without one it
 * holds, as every reader of Entries in a Series sees it. Only inside the
 * window's `StoryBibleContext`.
 */
export function useStoryBibleAsOf(book: string | undefined): StoryBibleLens {
  const source = useContext(StoryBibleContext);
  if (!source) throw new Error('No Story Bible to see Entries through');
  return useMemo(() => storyBibleAsOf(source, book), [source, book]);
}
