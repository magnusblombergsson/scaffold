import { useState } from 'react';
import { entryTitle } from '../shared/entry';
import type { EntrySummary } from '../shared/project-types';
import { ImagePromptDialog } from './ImagePromptDialog';
import { useImageUrl, ViewableImage } from './ImageView';

/**
 * An Entry's image as a `data:` URL, or null without one; it is read again
 * when the Entry's image changes, even under the same file name.
 */
export function useEntryImage({ id, image }: EntrySummary): string | null {
  return useImageUrl(
    image,
    () => window.project.entryImage(id),
    (event) => event.type === 'entryImageChanged' && event.id === id,
  );
}

/**
 * An Entry's image, small, right of its name in a list row or on a card;
 * clicked, the large view.
 */
export function EntryThumbnail({ entry }: { entry: EntrySummary }) {
  const url = useEntryImage(entry);
  // Its name is beside it: the image adds nothing to read aloud.
  return url ? (
    <ViewableImage
      className="entry-thumbnail"
      src={url}
      alt=""
      caption={entryTitle(entry)}
    />
  ) : null;
}

/**
 * The Entry view's image as a portrait, which opens the large view, with Add,
 * Replace and Remove, and Image prompt…, which has the Assistant describe the
 * Entry for an image generator, stacked to its right. Without an image a dashed frame keeps the
 * portrait's place.
 */
export function EntryImageSection({ entry }: { entry: EntrySummary }) {
  const url = useEntryImage(entry);
  const [imagePrompt, setImagePrompt] = useState(false);
  return (
    <section className="entry-image">
      {url ? (
        <ViewableImage
          src={url}
          alt={`Image of ${entryTitle(entry)}`}
          caption={entryTitle(entry)}
        />
      ) : (
        <div className="entry-image-empty" />
      )}
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
        <button type="button" onClick={() => setImagePrompt(true)}>
          Image prompt…
        </button>
      </div>
      {imagePrompt && (
        <ImagePromptDialog
          entry={entry}
          onClose={() => setImagePrompt(false)}
        />
      )}
    </section>
  );
}
