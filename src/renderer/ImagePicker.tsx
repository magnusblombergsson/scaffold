import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ImageRef, ProjectImage } from '../shared/project-types';
import { holdersLabel, imagesMatching, offersImage } from './image-picker';
import { useImageUrl } from './ImageView';

/** Choose from Project…: whether a unit has an image to pick, and picking one. */
export type ImagePicker = {
  offers(ref: ImageRef): boolean;
  choose(ref: ImageRef): void;
};

/** Without a Project, nothing to pick. */
const ImagePickerContext = createContext<ImagePicker>({
  offers: () => false,
  choose: () => {},
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
export function ImagePickerProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [target, setTarget] = useState<ImageRef | null>(null);

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
      value={{ offers: (ref) => offersImage(images, ref), choose: setTarget }}
    >
      {children}
      {target && (
        <ImagePickerDialog target={target} onClose={() => setTarget(null)} />
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
    void window.project.copyImage(target, image.holders[0]);
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
