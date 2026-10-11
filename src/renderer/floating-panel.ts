import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import { placeInside, type Point, type Size } from './pinned-notes';

/**
 * What lets a panel floating over Writing, a Pinned note or the Floating
 * image, be dragged by its header: `move` is told each place it is dragged
 * to, kept inside the window, and `save` once it is let go. A drag doesn't
 * start from a button or an image in the header.
 */
export function useDrag(
  shown: Point,
  size: Size,
  room: Size,
  move: (at: Point, save: boolean) => void,
) {
  /** Where the pointer holds the panel while it is dragged, from its corner. */
  const grip = useRef<Point | null>(null);
  /** Where the dragged panel was last moved to, to save once it is let go. */
  const dragged = useRef<Point | null>(null);
  /** Ends a drag, the pointer let go or lost: the panel is saved where it was moved. */
  const drop = () => {
    const at = dragged.current;
    grip.current = null;
    dragged.current = null;
    if (at) move(at, true);
  };
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const target = event.target as HTMLElement;
      if (target.closest('button, .viewable-image')) return;
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      grip.current = {
        x: event.clientX - shown.x,
        y: event.clientY - shown.y,
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!grip.current) return;
      const at = placeInside(
        {
          x: event.clientX - grip.current.x,
          y: event.clientY - grip.current.y,
        },
        size,
        room,
      );
      dragged.current = at;
      move(at, false);
    },
    onPointerUp: drop,
    onLostPointerCapture: drop,
  };
}

/** The element's size as it shows, as it changes; `width` until measured. */
export function useElementSize(
  element: RefObject<HTMLElement | null>,
  width: number,
): Size {
  const [size, setSize] = useState({ width, height: 0 });
  useLayoutEffect(() => {
    const observed = element.current;
    if (!observed) return;
    const observer = new ResizeObserver(() =>
      setSize({
        width: observed.offsetWidth,
        height: observed.offsetHeight,
      }),
    );
    observer.observe(observed);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

/** The window's inner size, as it changes. */
export function useWindowSize(): Size {
  const measure = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const resize = () => setSize(measure());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return size;
}
