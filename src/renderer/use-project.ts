import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { unitKey, type UnitValue, type ValueOf } from '../shared/project-types';
import type { PendingProposal } from '../shared/proposal';
import type { HeldRef, ProjectMirror, ProjectState } from './project-mirror';

/** The Project as main last told this window; renders again when it changes. */
export function useProject(mirror: ProjectMirror): ProjectState {
  return useSyncExternalStore(mirror.subscribe, mirror.getSnapshot);
}

/** The window's Project mirror, for the components that show its units. */
export const MirrorContext = createContext<ProjectMirror | null>(null);

/** The window's Project mirror; only inside a `MirrorContext`. */
export function useMirror(): ProjectMirror {
  const mirror = useContext(MirrorContext);
  if (!mirror) throw new Error('No Project mirror here');
  return mirror;
}

/**
 * The window's `run`: the one way a view writes the Project. It flushes
 * pending edits first, reports a failure, and offers an Undo when asked.
 */
export function useRun(): ProjectMirror['run'] {
  const mirror = useMirror();
  return useMemo(() => mirror.run.bind(mirror), [mirror]);
}

/**
 * A unit's value as it is now: undefined until it is read, null when it
 * can't be, as once it is in Trash, or with no unit.
 */
export function useUnit<R extends HeldRef>(
  ref: R | null,
): ValueOf<R> | null | undefined {
  const mirror = useMirror();
  const key = ref && unitKey(ref);
  const subscribe = useCallback(
    (listener: () => void) =>
      ref ? mirror.watchUnit(ref, listener) : () => {},
    // By its key: a ref made anew each render is the same unit.
    [mirror, key],
  );
  return useSyncExternalStore(subscribe, () => ref && mirror.unit(ref));
}

/**
 * A unit's value as `useUnit` has it, for a view that makes editors of it:
 * undefined until no write of this window's to it is on its way, so that
 * they start from what was written, and an editor kept from earlier, with
 * its history, is kept. Seen once the views left have flushed their edits,
 * which they do as they unmount, after this view renders.
 */
export function useUnitToEdit<R extends HeldRef>(
  ref: R | null,
): ValueOf<R> | null | undefined {
  const mirror = useMirror();
  const value = useUnit(ref);
  const key = ref && unitKey(ref);
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (ref && ready !== key && value && !mirror.writing(ref)) setReady(key);
  });
  if (ready === key) return value;
  return value === null ? null : undefined;
}

/** The values of `refs`, in their order, as `useUnit` has each. */
export function useUnits<R extends HeldRef>(
  refs: readonly R[],
): (ValueOf<R> | null | undefined)[] {
  const mirror = useMirror();
  const keys = refs.map(unitKey).join(',');
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = refs.map((ref) => mirror.watchUnit(ref, listener));
      return () => stops.forEach((stop) => stop());
    },
    // By their keys: refs made anew each render are the same units.
    [mirror, keys],
  );
  /** The values last handed out, handed out again while none has changed. */
  const last = useRef<(UnitValue | null | undefined)[]>([]);
  const snapshot = () => {
    const values = refs.map((ref) => mirror.unit(ref));
    const same =
      values.length === last.current.length &&
      values.every((value, i) => value === last.current[i]);
    if (!same) last.current = values;
    return last.current as (ValueOf<R> | null | undefined)[];
  };
  return useSyncExternalStore(subscribe, snapshot);
}

/** The Proposals pending on an Entry, in any Conversation; none until read. */
export function usePending(entryId: string): PendingProposal[] {
  const mirror = useMirror();
  const subscribe = useCallback(
    (listener: () => void) => mirror.watchPending(entryId, listener),
    [mirror, entryId],
  );
  return useSyncExternalStore(subscribe, () => mirror.pending(entryId)) ?? NONE;
}

/** No Proposals, the same each time. */
const NONE: PendingProposal[] = [];

/**
 * The Outlines of `ids`, by id, as they are now: each once read, empty when
 * it can't be. `allRead` once every one is.
 */
export function useOutlines(ids: readonly string[]): {
  outlines: ReadonlyMap<string, string>;
  allRead: boolean;
} {
  const values = useUnits(ids.map((id) => ({ kind: 'outline', id }) as const));
  const key = ids.join(',');
  return useMemo(() => {
    const outlines = new Map<string, string>();
    (key ? key.split(',') : []).forEach((id, i) => {
      const value = values[i];
      if (value !== undefined) outlines.set(id, value?.body ?? '');
    });
    return {
      outlines,
      allRead: values.every((value) => value !== undefined),
    };
  }, [key, values]);
}
