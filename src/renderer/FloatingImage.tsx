import { useContext, useRef, useState, type PointerEvent } from 'react';
import type { FloatingImage } from '../shared/api';
import type { ManuscriptScene } from '../shared/project-types';
import { Menu } from './Binder';
import { ViewableImage } from './ImageView';
import { useImagePicker } from './ImagePicker';
import { unitImageAddItems, useUnitImage } from './UnitImage';
import { fitWidth, type ImageChange } from './floating-image';
import { useDrag, useElementSize, useWindowSize } from './floating-panel';
import { placeInside } from './pinned-notes';
import { ReadOnlyContext } from './read-only';

/** Its border, top and bottom, which the header's height leaves out. */
const BORDERS = 2;
/** Its layer over every Pinned note, or under them all. */
const OVER_NOTES = 1000;
const UNDER_NOTES = -1;

/**
 * The image of the Scene being written, small, in the Outline & Notes bar;
 * clicked, the large view. Its ⋯ menu, which a right-click opens too, floats
 * it as the Floating image, unless it floats already. Nothing without an
 * image.
 */
export function OutlineBarImage({
  scene,
  floating,
  onFloat,
}: {
  scene: ManuscriptScene;
  /** Whether the Floating image is on already. */
  floating: boolean;
  onFloat(): void;
}) {
  const url = useUnitImage({ kind: 'scene', id: scene.id }, scene.image);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!url) return null;
  return (
    <div
      className="outline-notes-image"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <ViewableImage
        className="outline-notes-thumbnail"
        src={url}
        alt={`Image of ${scene.title}`}
        caption={scene.title}
      />
      <Menu
        label={`Image actions: ${scene.title}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[{ label: 'Float image', disabled: floating, run: onFloat }]}
      />
    </div>
  );
}

/**
 * The Floating image: the image of the Scene being written, with its title,
 * over the page. It is dragged by its header, resized from its corner with
 * the image's proportions kept, folded to its title and closed; the window
 * shrinking never leaves it outside. A Scene without an image shows No image
 * and Add image…, and Choose from Project…, in its place.
 */
export function FloatingImagePanel({
  image,
  scene,
  onTop,
  onChange,
  onRaise,
}: {
  image: FloatingImage;
  scene: ManuscriptScene;
  /** Whether it stacks over the Pinned notes rather than under them. */
  onTop: boolean;
  /** `save` once the change is done, not while it is dragged or resized. */
  onChange(change: ImageChange, save: boolean): void;
  onRaise(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const imagePicker = useImagePicker();
  const url = useUnitImage({ kind: 'scene', id: scene.id }, scene.image);
  const room = useWindowSize();
  const element = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  /** The image's width to its height, once the image of `url` has loaded. */
  const [loaded, setLoaded] = useState<{ url: string; ratio: number } | null>(
    null,
  );
  const ratio = loaded && loaded.url === url ? loaded.ratio : null;
  const chrome = useElementSize(header, 0).height + BORDERS;
  const width = fitWidth(image.width, ratio, room, chrome);
  const size = useElementSize(element, width);
  const shown = placeInside(image, size, room);
  const drag = useDrag(shown, size, room, (at, save) =>
    onChange({ type: 'move', at }, save),
  );
  /** Where the resize started: the pointer and the width then. */
  const resizing = useRef<{ x: number; y: number; width: number } | null>(null);
  /** The width last resized to, to save once the corner is let go. */
  const resized = useRef<number | null>(null);
  const endResize = () => {
    const done = resized.current;
    resizing.current = null;
    resized.current = null;
    if (done !== null) onChange({ type: 'resize', width: done }, true);
  };
  const adds = unitImageAddItems(scene, readOnly, imagePicker);

  return (
    <section
      ref={element}
      className={`pinned-note floating-image${image.folded ? ' folded' : ''}`}
      aria-label={`Floating image: ${scene.title}`}
      style={{
        left: shown.x,
        top: shown.y,
        width,
        zIndex: onTop ? OVER_NOTES : UNDER_NOTES,
      }}
      onPointerDown={onRaise}
    >
      <header
        ref={header}
        className="pinned-note-header"
        title="Drag to move"
        {...drag}
      >
        <span className="pinned-note-grip" aria-hidden="true">
          ⠿
        </span>
        <h2 className="pinned-note-title">{scene.title}</h2>
        <button
          className="peek-card-icon"
          aria-label={image.folded ? 'Unfold the image' : 'Fold the image'}
          aria-expanded={!image.folded}
          title={image.folded ? 'Unfold' : 'Fold to title'}
          onClick={() =>
            onChange({ type: 'fold', folded: !image.folded }, true)
          }
        >
          <span aria-hidden="true">{image.folded ? '▸' : '▾'}</span>
        </button>
        <button
          className="peek-card-icon"
          aria-label="Close the Floating image"
          title="Close"
          onClick={() => onChange({ type: 'close' }, true)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {/* Nothing to show while its image is read. */}
      {!image.folded && (url || !scene.image) && (
        <>
          {url ? (
            <div className="pinned-note-body pinned-note-picture">
              <ViewableImage
                src={url}
                alt={`Image of ${scene.title}`}
                caption={scene.title}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalHeight > 0) {
                    setLoaded({ url, ratio: naturalWidth / naturalHeight });
                  }
                }}
              />
            </div>
          ) : (
            <div className="pinned-note-body floating-image-empty">
              <p>No image</p>
              {adds.map((item) => (
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
          )}
          <div
            className="floating-image-resize"
            title="Drag to resize"
            aria-hidden="true"
            onPointerDown={(event: PointerEvent<HTMLElement>) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              resizing.current = {
                x: event.clientX,
                y: event.clientY,
                width,
              };
            }}
            onPointerMove={(event) => {
              const start = resizing.current;
              if (!start) return;
              const across = event.clientX - start.x;
              // Dragged down, it widens as much as the image grows taller.
              const down = ratio ? (event.clientY - start.y) * ratio : across;
              const next = fitWidth(
                start.width + Math.max(across, down),
                ratio,
                room,
                chrome,
              );
              resized.current = next;
              onChange({ type: 'resize', width: next }, false);
            }}
            onPointerUp={endResize}
            onLostPointerCapture={endResize}
          />
        </>
      )}
    </section>
  );
}
