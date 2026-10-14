import {
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { CallFailure } from '../shared/api';
import { wordDiff } from '../shared/diff';
import { suggestedSnapshotName, type Snapshot } from '../shared/snapshot';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';

/** Hears a Scene's Prose as the editor changes it; returns how to stop. */
export type ListenToProse = (
  listener: (sceneId: string, markdown: string) => void,
) => () => void;

/**
 * A Scene's editor, `children`, with its Snapshots listed above it while
 * `open`, and the one the Author compares beside it. While the Scene is in
 * Conflict, none is taken or restored.
 */
export function SceneSnapshots({
  sceneId,
  open,
  inConflict,
  listen,
  children,
}: {
  sceneId: string;
  open: boolean;
  inConflict: boolean;
  listen: ListenToProse;
  children: ReactNode;
}) {
  const snapshots = useSnapshots(sceneId);
  const [comparing, setComparing] = useState<string>();
  const shown = open
    ? snapshots.find((snapshot) => snapshot.id === comparing)
    : undefined;
  return (
    <>
      {open && (
        <SnapshotList
          sceneId={sceneId}
          snapshots={snapshots}
          inConflict={inConflict}
          comparing={shown?.id}
          onCompare={setComparing}
        />
      )}
      <div className="scene-beside">
        {children}
        {shown && (
          <SnapshotCompare
            sceneId={sceneId}
            snapshot={shown}
            listen={listen}
            onClose={() => setComparing(undefined)}
          />
        )}
      </div>
    </>
  );
}

/** The Scene's Snapshots, newest first, as main has them now. */
function useSnapshots(sceneId: string): Snapshot[] {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  useEffect(() => {
    let current = true;
    const load = () =>
      window.project.listSnapshots(sceneId).then((list) => {
        if (current) setSnapshots(list);
      });
    void load();
    const unsubscribe = window.project.subscribe((event) => {
      if (event.type === 'snapshotsChanged') void load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [sceneId]);
  return snapshots;
}

/**
 * A Scene's Snapshots: taking one under a name, suggested as when it is
 * taken, and each one listed with when it was taken, to compare beside the
 * Prose, rename, restore or move to Trash. `comparing` is the one beside it.
 */
function SnapshotList({
  sceneId,
  snapshots,
  inConflict,
  comparing,
  onCompare,
}: {
  sceneId: string;
  snapshots: Snapshot[];
  inConflict: boolean;
  comparing?: string;
  onCompare(id: string | undefined): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [name, setName] = useState(() => suggestedSnapshotName(new Date()));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Runs a change to the Snapshots, saying why main refused it. */
  async function run(command: () => Promise<unknown>): Promise<boolean> {
    try {
      await command();
      setError(null);
      return true;
    } catch (failure) {
      setError((failure as CallFailure).message);
      return false;
    }
  }

  async function take(event: FormEvent) {
    event.preventDefault();
    // What is taken is the Prose as main has it.
    flushPendingEdits();
    if (await run(() => window.project.takeSnapshot(sceneId, name))) {
      setName(suggestedSnapshotName(new Date()));
    }
  }

  async function restore(id: string) {
    flushPendingEdits();
    if (await run(() => window.project.restoreSnapshot(id))) {
      onCompare(undefined);
    }
  }

  return (
    <section className="snapshots" aria-label="Snapshots">
      <form className="snapshot-take" onSubmit={take}>
        <input
          aria-label="Snapshot name"
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={readOnly || inConflict || !name.trim()}>
          Take Snapshot
        </button>
      </form>
      {inConflict && (
        <p className="snapshots-empty">
          While this Scene is in Conflict, a Snapshot can't be taken or
          restored. Choose a version first.
        </p>
      )}
      {snapshots.length === 0 ? (
        <p className="snapshots-empty">
          No Snapshots of this Scene yet. A Snapshot keeps its Prose as it is
          now, to compare or restore later.
        </p>
      ) : (
        <ul className="snapshot-list">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              aria-current={snapshot.id === comparing || undefined}
            >
              {renaming === snapshot.id ? (
                <RenameSnapshot
                  snapshot={snapshot}
                  onDone={async (name) => {
                    if (
                      name === null ||
                      (await run(() =>
                        window.project.renameSnapshot(snapshot.id, name),
                      ))
                    ) {
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <span className="snapshot-name">{snapshot.name}</span>
              )}
              <time
                className="snapshot-taken"
                dateTime={new Date(snapshot.takenAt).toISOString()}
              >
                {takenText(snapshot.takenAt)}
              </time>
              <span className="snapshot-actions">
                <button
                  className="link-button"
                  aria-pressed={snapshot.id === comparing}
                  onClick={() =>
                    onCompare(
                      snapshot.id === comparing ? undefined : snapshot.id,
                    )
                  }
                >
                  Compare
                </button>
                <button
                  className="link-button"
                  disabled={readOnly}
                  onClick={() => setRenaming(snapshot.id)}
                >
                  Rename
                </button>
                <button
                  className="link-button"
                  disabled={readOnly || inConflict}
                  title="Replaces the Prose with this Snapshot's, after taking a Snapshot of the Prose now"
                  onClick={() => void restore(snapshot.id)}
                >
                  Restore
                </button>
                <button
                  className="link-button"
                  disabled={readOnly}
                  onClick={() => {
                    if (snapshot.id === comparing) onCompare(undefined);
                    void run(() => window.project.trashSnapshot(snapshot.id));
                  }}
                >
                  Move to Trash
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** A Snapshot's name being edited; Enter keeps it, Escape leaves it as it was. */
function RenameSnapshot({
  snapshot,
  onDone,
}: {
  snapshot: Snapshot;
  onDone(name: string | null): void;
}) {
  const [name, setName] = useState(snapshot.name);
  return (
    <form
      className="snapshot-rename"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name.trim() && name !== snapshot.name ? name : null);
      }}
    >
      <input
        aria-label="Snapshot name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone(null);
        }}
      />
      <button type="submit">Save</button>
    </form>
  );
}

/**
 * A Snapshot beside the current Prose, read-only and selectable: what it
 * has that the Prose no longer does struck through, and what the Prose has
 * since highlighted where it came, which a selection never takes, so that
 * what is copied is the Snapshot's alone.
 */
function SnapshotCompare({
  sceneId,
  snapshot,
  listen,
  onClose,
}: {
  sceneId: string;
  snapshot: Snapshot;
  listen: ListenToProse;
  onClose(): void;
}) {
  const prose = useProse(sceneId, listen);
  const now = useDeferredValue(prose ?? snapshot.markdown);
  const parts = useMemo(
    () => wordDiff(snapshot.markdown, now),
    [snapshot.markdown, now],
  );
  return (
    <aside className="snapshot-compare" aria-label="Snapshot">
      <div className="snapshot-compare-bar">
        <span>
          <strong>{snapshot.name}</strong>{' '}
          <span className="snapshot-taken">{takenText(snapshot.takenAt)}</span>
        </span>
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="snapshot-compare-key">
        <del>Struck through</del>: only in the Snapshot. <ins>Highlighted</ins>:
        only in the Prose now, never copied with the Snapshot.
      </p>
      <div className="snapshot-compare-text" aria-label="Changes">
        {parts.map((part, i) =>
          part.kind === 'removed' ? (
            <del key={i}>{part.text}</del>
          ) : part.kind === 'added' ? (
            <ins key={i}>{part.text}</ins>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </div>
    </aside>
  );
}

/** The Scene's Prose as the editor has it, from main's first; null until read. */
function useProse(sceneId: string, listen: ListenToProse): string | null {
  const [prose, setProse] = useState<string | null>(null);
  useEffect(() => {
    let heard = false;
    const stop = listen((id, markdown) => {
      if (id !== sceneId) return;
      heard = true;
      setProse(markdown);
    });
    flushPendingEdits();
    void window.project.read({ kind: 'scene', id: sceneId }).then((value) => {
      if (!heard) setProse(value.markdown);
    });
    return stop;
  }, [sceneId, listen]);
  return prose;
}

/** When a Snapshot was taken, to the minute, in the Author's own way. */
function takenText(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
