import { useContext, useState } from 'react';
import { entryTitle } from '../shared/entry';
import type {
  EntrySummary,
  ImageRef,
  ManuscriptChapter,
  ManuscriptScene,
} from '../shared/project-types';
import type { MenuItem } from './Binder';
import { ImagePromptDialog } from './ImagePromptDialog';
import { useImageUrl, ViewableImage } from './ImageView';
import { ReadOnlyContext } from './read-only';

type Unit = ManuscriptChapter | ManuscriptScene;

/** The image ref of a Chapter or Scene. */
function unitRef(unit: Unit): ImageRef {
  return { kind: 'scenes' in unit ? 'chapter' : 'scene', id: unit.id };
}

/** The image ref of an Entry. */
function entryRef({ id }: EntrySummary): ImageRef {
  return { kind: 'entry', id };
}

/**
 * The image of a Scene, Chapter or Entry as a `data:` URL, or null without
 * one; `image` is the file its summary names. It is read again when the
 * unit's image changes, even under the same file name.
 */
export function useUnitImage(ref: ImageRef, image?: string): string | null {
  return useImageUrl(
    image,
    () => window.project.image(ref),
    (event) => event.type === 'imageChanged' && event.ref.id === ref.id,
  );
}

/**
 * An Entry's image, small, right of its name in a list row or on a card;
 * clicked, the large view.
 */
export function EntryThumbnail({ entry }: { entry: EntrySummary }) {
  const url = useUnitImage(entryRef(entry), entry.image);
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
  const ref = entryRef(entry);
  const url = useUnitImage(ref, entry.image);
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
          onClick={() => void window.project.chooseImage(ref)}
        >
          {entry.image ? 'Replace image…' : 'Add image…'}
        </button>
        {entry.image && (
          <button
            type="button"
            onClick={() => void window.project.removeImage(ref)}
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

/**
 * A Scene's or Chapter's image, small, beside its title on a card, a lane,
 * a Corkboard's header or an Overview row; clicked, the large view.
 */
export function UnitThumbnail({ unit }: { unit: Unit }) {
  const url = useUnitImage(unitRef(unit), unit.image);
  return url ? (
    <ViewableImage
      className="unit-thumbnail"
      src={url}
      alt={`Image of ${unit.title}`}
      caption={unit.title}
    />
  ) : null;
}

/** Add image… or Replace image…, and Remove image, as buttons. */
export function UnitImageButtons({ unit }: { unit: Unit }) {
  const readOnly = useContext(ReadOnlyContext);
  return (
    <div className="unit-image-actions">
      {unitImageItems(unit, readOnly).map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={() => 'run' in item && void item.run()}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Add image… or Replace image…, and Remove image, in a unit's menu. */
export function unitImageItems(unit: Unit, readOnly: boolean): MenuItem[] {
  return [
    {
      label: unit.image ? 'Replace image…' : 'Add image…',
      disabled: readOnly,
      run: () => window.project.chooseImage(unitRef(unit)),
    },
    ...(unit.image
      ? [
          {
            label: 'Remove image',
            disabled: readOnly,
            run: () => window.project.removeImage(unitRef(unit)),
          },
        ]
      : []),
  ];
}
