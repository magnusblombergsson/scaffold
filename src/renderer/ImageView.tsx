import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ProjectEvent } from '../shared/api';

/**
 * The image file `image` names, as a `data:` URL from `load`, or null
 * without one; it is loaded again on each event `changed` says is of it,
 * as the file can be replaced under the same name.
 */
export function useImageUrl(
  image: string | undefined,
  load: () => Promise<string | null>,
  changed: (event: ProjectEvent) => boolean,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const latest = useRef({ load, changed });
  useEffect(() => {
    latest.current = { load, changed };
  });
  useEffect(() => {
    setUrl(null);
    if (!image) return;
    let current = true;
    const reload = () =>
      void latest.current.load().then((loaded) => {
        if (current) setUrl(loaded);
      });
    reload();
    const unsubscribe = window.project.subscribe((event) => {
      if (latest.current.changed(event)) reload();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [image]);
  return image ? url : null;
}

/**
 * An image that opens the large view when clicked, captioned with `caption`.
 *
 * The click is its own: it doesn't open the row or card it sits on. A Pinned
 * note's header doesn't start a drag from it either.
 */
export function ViewableImage({
  caption,
  className,
  ...image
}: ImgHTMLAttributes<HTMLImageElement> & { src: string; caption: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        {...image}
        className={`viewable-image${className ? ` ${className}` : ''}`}
        draggable={false}
        onClick={(event) => {
          stopPropagation(event);
          event.preventDefault();
          setOpen(true);
        }}
      />
      {open && (
        <ImageView
          src={image.src}
          caption={caption}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The large view: the app dimmed, the image fitted to the window, its name as
 * caption. Escape, a click outside the image or × closes it.
 *
 * Its events still reach the components it was opened from, a Peek or a Pinned
 * note: what happens in it stays in it, so Escape or a click doesn't also close
 * the Peek, open the row or drag the note.
 */
export function ImageView({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption: string;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => dialogRef.current?.showModal(), []);
  // In the body, as a dialog can't be inside the list row's button.
  return createPortal(
    <dialog
      ref={dialogRef}
      className="image-view"
      aria-label={caption}
      // Escape closes it.
      onClose={onClose}
      onClick={(event) => {
        stopPropagation(event);
        if (!(event.target instanceof HTMLImageElement)) {
          dialogRef.current?.close();
        }
      }}
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onKeyDown={stopPropagation}
      onContextMenu={stopPropagation}
    >
      <figure>
        <img
          src={src}
          alt={`Image of ${caption}`}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight, style } = event.currentTarget;
            style.setProperty('--ratio', String(naturalWidth / naturalHeight));
          }}
        />
        <figcaption>{caption}</figcaption>
      </figure>
      <button
        className="image-view-close"
        aria-label="Close"
        title="Close"
        onClick={() => dialogRef.current?.close()}
      >
        <span aria-hidden="true">×</span>
      </button>
    </dialog>,
    document.body,
  );
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}
