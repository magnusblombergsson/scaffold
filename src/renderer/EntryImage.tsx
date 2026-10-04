import { useEffect, useState } from 'react';
import type { EntrySummary } from '../shared/project-types';
import { entryTitle } from './StoryBible';

/**
 * An Entry's image as a `data:` URL, or null without one; it is read again
 * when the Entry's image changes, even under the same file name.
 */
export function useEntryImage({ id, image }: EntrySummary): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!image) return;
    let current = true;
    const load = () =>
      void window.project.entryImage(id).then((loaded) => {
        if (current) setUrl(loaded);
      });
    load();
    const unsubscribe = window.project.subscribe((event) => {
      if (event.type === 'entryImageChanged' && event.id === id) load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [id, image]);
  return image ? url : null;
}

/** An Entry's image, small, beside its name in the Story Bible list. */
export function EntryThumbnail({ entry }: { entry: EntrySummary }) {
  const url = useEntryImage(entry);
  // Its name is beside it: the image adds nothing to read aloud.
  return url ? <img className="entry-thumbnail" src={url} alt="" /> : null;
}

/** The Entry view's image, with Add, Replace and Remove. */
export function EntryImageSection({ entry }: { entry: EntrySummary }) {
  const url = useEntryImage(entry);
  return (
    <section className="entry-image">
      {url && <img src={url} alt={`Image of ${entryTitle(entry)}`} />}
      <div className="entry-image-actions">
        <button
          type="button"
          onClick={() => void window.project.chooseEntryImage(entry.id)}
        >
          {entry.image ? 'Replace image…' : 'Add image…'}
        </button>
        {entry.image && (
          <button
            type="button"
            onClick={() => void window.project.removeEntryImage(entry.id)}
          >
            Remove image
          </button>
        )}
      </div>
    </section>
  );
}
