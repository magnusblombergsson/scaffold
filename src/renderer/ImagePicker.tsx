import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ImageHolder,
  ImageMatches,
  ImageRef,
  PartLabel,
  ProjectImage,
} from '../shared/project-types';
import {
  holderLabel,
  holdersLabel,
  imagesMatching,
  offersImage,
  sharesImage,
  skipMessage,
} from './image-picker';
import { useImageUrl } from './ImageView';
import { useRun } from './use-project';

/**
 * Choose from Project…: whether a unit has an image to pick, and picking
 * one. Replace everywhere…: whether another live unit holds an identical
 * image, and replacing it on them.
 */
export type ImagePicker = {
  offers(ref: ImageRef): boolean;
  choose(ref: ImageRef): void;
  shares(ref: ImageRef): boolean;
  replaceEverywhere(ref: ImageRef): Promise<void>;
  /** Add image… or Replace image…: one the Author chooses from their files. */
  chooseFile(ref: ImageRef): Promise<void>;
  /** Remove image. */
  remove(ref: ImageRef): Promise<void>;
};

/** Without a Project, nothing to pick. */
const ImagePickerContext = createContext<ImagePicker>({
  offers: () => false,
  choose: () => {},
  shares: () => false,
  replaceEverywhere: async () => {},
  chooseFile: async () => {},
  remove: async () => {},
});

export function useImagePicker(): ImagePicker {
  return useContext(ImagePickerContext);
}

/**
 * Keeps the Project's images to know which units have one to pick; shows
 * the picker for the unit it is chosen for. They are asked again as an
 * image changes, and as units are renamed or moved, to the Drawer too.
 * Not on other unit details, as each asking reads every image.
 */
export function ImagePickerProvider({
  partLabel,
  children,
}: {
  partLabel?: PartLabel;
  children: ReactNode;
}) {
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [target, setTarget] = useState<ImageRef | null>(null);
  /** The unit Replace everywhere… is for, and the new image picked for it. */
  const [replacing, setReplacing] = useState<{
    start: ImageHolder;
    url: string;
  } | null>(null);

  const run = useRun();

  async function replaceEverywhere(ref: ImageRef) {
    const url = await run((project) => project.pickImage(), {
      what: 'pick the image',
    });
    if (!url) return;
    const held = images
      .flatMap((image) => image.holders)
      .find((h) => h.id === ref.id);
    setReplacing({ start: { ...ref, title: held?.title ?? '' }, url });
  }

  useEffect(() => {
    let current = true;
    const list = () =>
      void window.project.projectImages().then(
        (listed) => current && setImages(listed),
        (error: unknown) => console.error("Can't list the images:", error),
      );
    list();
    const unsubscribe = window.project.subscribe((event) => {
      if (
        event.type === 'imageChanged' ||
        event.type === 'structureChanged' ||
        event.type === 'entriesChanged'
      ) {
        list();
      }
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  return (
    <ImagePickerContext.Provider
      value={{
        offers: (ref) => offersImage(images, ref),
        choose: setTarget,
        shares: (ref) => sharesImage(images, ref),
        replaceEverywhere,
        chooseFile: async (ref) => {
          await run((project) => project.chooseImage(ref), {
            what: 'add the image',
          });
        },
        remove: async (ref) => {
          await run((project) => project.removeImage(ref), {
            what: 'remove the image',
          });
        },
      }}
    >
      {children}
      {target && (
        <ImagePickerDialog target={target} onClose={() => setTarget(null)} />
      )}
      {replacing && (
        <ReplaceEverywhereDialog
          start={replacing.start}
          url={replacing.url}
          partLabel={partLabel}
          onClose={() => setReplacing(null)}
        />
      )}
    </ImagePickerContext.Provider>
  );
}

/**
 * The Project's images that `target` could take a copy of, as tiles, with a
 * box narrowing them by the names of the units holding each. Clicking one,
 * or Enter on it, gives `target` its copy; Escape changes nothing.
 */
function ImagePickerDialog({
  target,
  onClose,
}: {
  target: ImageRef;
  onClose(): void;
}) {
  const run = useRun();
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Where focus was, to go back to. */
  const opener = useRef(document.activeElement);
  const [images, setImages] = useState<ProjectImage[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    dialogRef.current?.showModal();
    let current = true;
    window.project.projectImages(target).then(
      (listed) => current && setImages(listed),
      (error: unknown) => console.error("Can't list the images:", error),
    );
    return () => {
      current = false;
    };
  }, [target]);

  function pick(image: ProjectImage) {
    dialogRef.current?.close();
    void run((project) => project.copyImage(target, image.holders[0]), {
      what: 'copy the image',
    });
  }

  const shown = images && imagesMatching(images, filter);
  return (
    <dialog
      ref={dialogRef}
      className="settings image-picker"
      aria-labelledby="image-picker-heading"
      // Escape closes it.
      onClose={() => {
        if (opener.current instanceof HTMLElement) opener.current.focus();
        onClose();
      }}
    >
      <h2 id="image-picker-heading">Choose from Project</h2>
      <input
        type="text"
        aria-label="Filter by name"
        placeholder="Filter by name"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        autoFocus
      />
      {shown && shown.length === 0 && (
        <p className="field-hint">No image is held by a unit of that name.</p>
      )}
      <ul className="image-picker-grid">
        {shown?.map((image) => (
          <li key={image.holders[0].id}>
            <ImageTile image={image} onPick={() => pick(image)} />
          </li>
        ))}
      </ul>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
      </div>
    </dialog>
  );
}

/** One image to pick, as its thumbnail named by the units holding it. */
function ImageTile({ image, onPick }: { image: ProjectImage; onPick(): void }) {
  const source = image.holders[0];
  const url = useImageUrl(
    source.id,
    () => window.project.projectImage(source),
    (event) => event.type === 'imageChanged' && event.ref.id === source.id,
  );
  const label = holdersLabel(image.holders);
  return (
    <button
      type="button"
      className="image-picker-tile"
      title={image.holders.map((h) => h.title).join('\n')}
      onClick={onPick}
    >
      {url ? <img src={url} alt="" /> : <span className="image-picker-blank" />}
      <span className="image-picker-label">{label}</span>
    </button>
  );
}

/**
 * Replace everywhere…, once the new image is picked: the old image and the
 * new, and the other live units holding the old, each ticked to take the
 * new too; `start` always does. Those in the Drawer or Trash are only
 * counted, as they keep the old. Units that couldn't take it are listed
 * once it is done; Cancel or Escape changes nothing.
 */
function ReplaceEverywhereDialog({
  start,
  url,
  partLabel,
  onClose,
}: {
  start: ImageHolder;
  /** The new image. */
  url: string;
  partLabel?: PartLabel;
  onClose(): void;
}) {
  const run = useRun();
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Where focus was, to go back to. */
  const opener = useRef(document.activeElement);
  const [matches, setMatches] = useState<ImageMatches | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [replacing, setReplacing] = useState(false);
  /** Why units weren't changed, once it is done and some weren't. */
  const [skipped, setSkipped] = useState<string[] | null>(null);
  // The old image as the dialog opened, kept once it is replaced.
  const old = useImageUrl(
    start.id,
    () => window.project.image(start),
    () => false,
  );

  useEffect(() => {
    dialogRef.current?.showModal();
    let current = true;
    window.project.imageMatches(start).then(
      (found) => current && setMatches(found),
      (error: unknown) => console.error("Can't find the matches:", error),
    );
    return () => {
      current = false;
    };
  }, [start]);

  function toggle(id: string) {
    const next = new Set(unticked);
    if (!next.delete(id)) next.add(id);
    setUnticked(next);
  }

  async function replace() {
    const holders = [
      start,
      ...(matches?.live.filter((h) => !unticked.has(h.id)) ?? []),
    ];
    setReplacing(true);
    const replaced = await run(
      (project) =>
        project.replaceImages(
          // Never an Evolution's image, which shares none.
          holders.map(({ kind, id }) => ({ kind, id }) as ImageRef),
        ),
      { what: 'replace the images' },
    );
    // Failed, as the Author has been told; they may try again.
    if (!replaced) {
      setReplacing(false);
      return;
    }
    const { skipped } = replaced;
    if (skipped.length === 0) return dialogRef.current?.close();
    setSkipped(
      skipped.map(({ ref, reason }) =>
        skipMessage(
          holders.find((h) => h.id === ref.id) ?? { ...ref, title: ref.id },
          reason,
        ),
      ),
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings replace-everywhere"
      aria-labelledby="replace-everywhere-heading"
      // Escape closes it.
      onClose={() => {
        if (opener.current instanceof HTMLElement) opener.current.focus();
        onClose();
      }}
    >
      <h2 id="replace-everywhere-heading">Replace everywhere</h2>
      {skipped ? (
        <>
          <p>Not every image was replaced:</p>
          <ul className="replace-everywhere-skipped">
            {skipped.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <div className="settings-close">
            <button onClick={() => dialogRef.current?.close()} autoFocus>
              OK
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="replace-everywhere-images">
            <figure>
              {old ? (
                <img src={old} alt="The old image" />
              ) : (
                <span className="image-picker-blank" />
              )}
              <figcaption>Old</figcaption>
            </figure>
            <span aria-hidden="true">→</span>
            <figure>
              <img src={url} alt="The new image" />
              <figcaption>New</figcaption>
            </figure>
          </div>
          <p>Also replace it on:</p>
          <ul className="replace-everywhere-units">
            {matches?.live.map((holder) => (
              <li key={holder.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!unticked.has(holder.id)}
                    onChange={() => toggle(holder.id)}
                  />
                  {holderLabel(holder, partLabel)}
                </label>
              </li>
            ))}
          </ul>
          {matches && matches.elsewhere > 0 && (
            <p className="field-hint">
              {matches.elsewhere} more in the Drawer or Trash{' '}
              {matches.elsewhere === 1 ? 'keeps' : 'keep'} the old image
            </p>
          )}
          <div className="settings-close">
            <button onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button
              disabled={!matches || replacing}
              onClick={() => void replace()}
            >
              Replace
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
