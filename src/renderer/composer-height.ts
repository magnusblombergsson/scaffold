import {
  createContext,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react';

/** How much of its pane the composer grows to with its text, unless dragged taller. */
const GROW_SHARE = 0.4;
/** How much of its pane the composer may be dragged to. */
const DRAG_SHARE = 0.7;

/**
 * How tall the composer's box may be, in CSS pixels, in a pane `pane` high:
 * at least the height the Author dragged it to, or 3 rows; growing with its
 * text to the larger of that and 40% of the pane. Dragging goes no higher
 * than `dragMax`, 70% of the pane, and no lower than 3 rows.
 */
export function composerBounds({
  dragged,
  threeRows,
  pane,
}: {
  /** The height the Author dragged it to; null if never, or reset. */
  dragged: number | null;
  threeRows: number;
  pane: number;
}): { min: number; max: number; dragMax: number } {
  const dragMax = Math.round(Math.max(threeRows, DRAG_SHARE * pane));
  const min = Math.round(
    Math.min(dragMax, Math.max(threeRows, dragged ?? threeRows)),
  );
  const max = Math.round(Math.max(min, GROW_SHARE * pane));
  return { min, max, dragMax };
}

/**
 * The height the Author dragged the message box to, one for every composer
 * in the window, and what changes it; `save` false while still dragging.
 */
export type ComposerHeight = {
  dragged: number | null;
  onDrag(height: number | null, save?: boolean): void;
};

export const ComposerHeightContext = createContext<ComposerHeight>({
  dragged: null,
  onDrag: () => {},
});

/** The message box's height, from as it was remembered on this computer. */
export function useComposerHeight(remembered: number | null): ComposerHeight {
  const [dragged, setDragged] = useState(remembered);
  return useMemo(
    () => ({
      dragged,
      onDrag(height, save = true) {
        setDragged(height);
        if (save) window.shell.setComposerHeight(height);
      },
    }),
    [dragged],
  );
}

/**
 * What the composer's box is sized from, in CSS pixels, as it changes: the
 * height of 3 rows of `textarea`, and of the pane `form` is in. Both are 0
 * until measured.
 */
export function useComposerMeasures(
  form: RefObject<HTMLFormElement | null>,
  textarea: RefObject<HTMLTextAreaElement | null>,
) {
  const [measures, setMeasures] = useState({ threeRows: 0, pane: 0 });
  useLayoutEffect(() => {
    const box = textarea.current;
    const pane = form.current?.parentElement;
    if (!box || !pane) return;
    const measure = () => {
      const style = getComputedStyle(box);
      const px = (value: string) => parseFloat(value) || 0;
      const next = {
        threeRows: Math.round(
          3 * px(style.lineHeight) +
            px(style.paddingTop) +
            px(style.paddingBottom) +
            px(style.borderTopWidth) +
            px(style.borderBottomWidth),
        ),
        pane: pane.clientHeight,
      };
      setMeasures((now) =>
        now.threeRows === next.threeRows && now.pane === next.pane ? now : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [form, textarea]);
  return measures;
}
