import { useContext, useState } from 'react';
import { entryTitle } from '../shared/entry';
import type {
  EntrySummary,
  ImageRef,
  ManuscriptBook,
  ManuscriptChapter,
  ManuscriptPart,
  ManuscriptScene,
} from '../shared/project-types';
import type { TitledBook } from '../shared/evolution';
import type { MenuItem } from './Binder';
import { useImagePicker, type ImagePicker } from './ImagePicker';
import { ImagePromptDialog } from './ImagePromptDialog';
import { useImageUrl, ViewableImage } from './ImageView';
import { ReadOnlyContext } from './read-only';

type Unit =
  | ManuscriptBook
  | ManuscriptPart
  | ManuscriptChapter
  | ManuscriptScene;

/** The image ref of a Book, Part, Chapter or Scene. */
function unitRef(unit: Unit): ImageRef {
  const kind =
    'top' in unit
      ? 'book'
      : 'chapters' in unit
        ? 'part'
        : 'scenes' in unit
          ? 'chapter'
          : 'scene';
  return { kind, id: unit.id };
}

/**
 * The image ref of an Entry's image file `image`: its own, or in a Series
 * its image from the Book that `<id>.<book id>.<extension>` names.
 */
export function entryImageRef(id: string, image?: string): ImageRef {
  const book = image?.startsWith(`${id}.`)
    ? /^([^.]+)\.(jpg|png)$/.exec(image.slice(id.length + 1))?.[1]
    : undefined;
  return book ? { kind: 'entry', id, book } : { kind: 'entry', id };
}

/** The image ref of the image an Entry's summary shows. */
function entryRef({ id, image }: EntrySummary): ImageRef {
  return entryImageRef(id, image);
}

/**
 * The image of a Scene, Chapter, Part or Entry as a `data:` URL, or null without
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
 * The Entry view's image as a portrait, which opens the large view, with
 * its image's actions, and Image prompt…, which has the Assistant describe
 * the Entry for an image generator, stacked to its right. Without an image
 * a dashed frame keeps the portrait's place.
 *
 * In a Series it shows the image as of a Book (#243): one from an
 * Evolution is marked, its actions land on that Evolution and Remove
 * Evolution takes it off; seen as of any Book after the first, Change from
 * that Book on… gives it an image from there.
 */
export function EntryImageSection({
  entry,
  evolution,
}: {
  /** The Entry as of the Book it is seen as of, if any. */
  entry: EntrySummary;
  evolution?: {
    /** The Book it is seen as of. */
    asOf: TitledBook;
    /** The Book whose Evolution gives the image shown, if one does. */
    from?: TitledBook;
    /** Whether a value can change from `asOf` on: it is not the first Book. */
    evolves: boolean;
  };
}) {
  const shown = entryRef(entry);
  const from = evolution?.from;
  const ref: ImageRef = from
    ? { kind: 'entry', id: entry.id, book: from.id }
    : { kind: 'entry', id: entry.id };
  const url = useUnitImage(shown, entry.image);
  const readOnly = useContext(ReadOnlyContext);
  const imagePicker = useImagePicker();
  const [imagePrompt, setImagePrompt] = useState(false);
  const items = imageItems(ref, entry.image, readOnly, imagePicker).map(
    (item) =>
      from && item.label === 'Remove image'
        ? { ...item, label: 'Remove Evolution' }
        : item,
  );
  const changes =
    evolution?.evolves && from?.id !== evolution.asOf.id
      ? evolution.asOf
      : undefined;
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
        {from && <EvolvedMark from={from} />}
        <ImageItemButtons items={items} />
        {changes && (
          <button
            type="button"
            disabled={readOnly}
            onClick={() =>
              void window.project.chooseImage({
                kind: 'entry',
                id: entry.id,
                book: changes.id,
              })
            }
          >
            Change from {changes.title} on…
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

/** Marks a value that comes from an Evolution, as “From Book 2”. */
export function EvolvedMark({ from }: { from: TitledBook }) {
  return <span className="evolved-mark">From {from.title}</span>;
}

/**
 * A Scene's, Chapter's or Part's image, small, beside its title on a card, a lane,
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

/**
 * A Scene's, Chapter's or Part's image filling the top of its card; clicked,
 * the large view. Without one, an empty frame keeps its place, with Add
 * image….
 */
export function UnitCardImage({ unit }: { unit: Unit }) {
  const readOnly = useContext(ReadOnlyContext);
  const imagePicker = useImagePicker();
  const url = useUnitImage(unitRef(unit), unit.image);
  if (url) {
    return (
      <ViewableImage
        className="card-image"
        src={url}
        alt={`Image of ${unit.title}`}
        caption={unit.title}
      />
    );
  }
  return (
    <div className="card-image empty">
      {/* One being read shows once it is. */}
      {!unit.image && (
        <ImageItemButtons
          items={unitImageAddItems(unit, readOnly, imagePicker)}
        />
      )}
    </div>
  );
}

/** Add image… or Replace image…, Choose from Project… and Remove image, as buttons. */
export function UnitImageButtons({ unit }: { unit: Unit }) {
  const readOnly = useContext(ReadOnlyContext);
  const imagePicker = useImagePicker();
  return (
    <div className="unit-image-actions">
      <ImageItemButtons items={unitImageItems(unit, readOnly, imagePicker)} />
    </div>
  );
}

/** Image actions as buttons, side by side or stacked as their parent lays them out. */
function ImageItemButtons({ items }: { items: MenuItem[] }) {
  return items.map((item) => (
    <button
      key={item.label}
      type="button"
      disabled={item.disabled}
      onClick={() => 'run' in item && void item.run()}
    >
      {item.label}
    </button>
  ));
}

/** `imageItems` of a Scene, Chapter or Part, in its menu. */
export function unitImageItems(
  unit: Unit,
  readOnly: boolean,
  imagePicker: ImagePicker,
): MenuItem[] {
  return imageItems(unitRef(unit), unit.image, readOnly, imagePicker);
}

/** `imageAddItems` of a Scene, Chapter or Part. */
export function unitImageAddItems(
  unit: Unit,
  readOnly: boolean,
  imagePicker: ImagePicker,
): MenuItem[] {
  return imageAddItems(unitRef(unit), unit.image, readOnly, imagePicker);
}

/**
 * A unit's image actions: `imageAddItems`, then Remove image when it
 * names one.
 */
function imageItems(
  ref: ImageRef,
  image: string | undefined,
  readOnly: boolean,
  imagePicker: ImagePicker,
): MenuItem[] {
  return [
    ...imageAddItems(ref, image, readOnly, imagePicker),
    ...(image
      ? [
          {
            label: 'Remove image',
            disabled: readOnly,
            run: () => window.project.removeImage(ref),
          },
        ]
      : []),
  ];
}

/**
 * Add image… or Replace image…, as the unit names an image or not, and
 * Choose from Project… when another unit has an image it could copy.
 */
function imageAddItems(
  ref: ImageRef,
  image: string | undefined,
  readOnly: boolean,
  imagePicker: ImagePicker,
): MenuItem[] {
  return [
    {
      label: image ? 'Replace image…' : 'Add image…',
      disabled: readOnly,
      run: () => window.project.chooseImage(ref),
    },
    ...(imagePicker.offers(ref)
      ? [
          {
            label: 'Choose from Project…',
            disabled: readOnly,
            run: () => imagePicker.choose(ref),
          },
        ]
      : []),
  ];
}
