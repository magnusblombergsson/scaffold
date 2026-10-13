import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LinkNames, Todo, TodoLink } from '../shared/todo';
import type { TodoDock } from '../shared/todo-dock';
import { PanelResizer } from './PanelResizer';
import { shownTodos, TodoList, type TodoDraft } from './TodoList';

/** The least height of the dock raised, and of the tab above it. */
const DOCK_MIN = 120;
const TAB_MIN = 120;

/**
 * How the Todos dock shows, from as it was remembered on this computer, and
 * what changes it; `save` false while the Author is still dragging its
 * divider.
 */
export function useTodoDock(
  remembered: TodoDock,
): [TodoDock, (change: Partial<TodoDock>, save?: boolean) => void] {
  const [dock, setDock] = useState(remembered);
  return [
    dock,
    (change, save = true) => {
      setDock((now) => ({ ...now, ...change }));
      if (save) window.shell.setTodoDock(change);
    },
  ];
}

/**
 * The Todos dock of Writing and the Story Bible, at the bottom of the left
 * pane below whichever tab or list shows. Folded, a header counts the Todos
 * not done that it shows; raised, it takes height from the tab above, set by
 * the divider between them.
 */
export function TodoDockPane({
  dock,
  onDock,
  todos,
  names,
  prelink,
  draft,
  onOpen,
  onOpenTrash,
  onError,
}: {
  dock: TodoDock;
  onDock(change: Partial<TodoDock>, save?: boolean): void;
  todos: Todo[];
  names: LinkNames;
  prelink: TodoLink | null;
  draft?: TodoDraft;
  onOpen(link: TodoLink): void;
  onOpenTrash(trashId: string): void;
  onError(message: string | null): void;
}) {
  const shown = shownTodos(todos, dock.scope, prelink, names);
  const count = shown.filter((todo) => !todo.done).length;
  const [ref, most] = useMostHeight();
  const max = Math.max(DOCK_MIN, most);
  const height = Math.max(DOCK_MIN, Math.min(dock.height, max));

  return (
    <div
      ref={ref}
      className={`todo-dock${dock.folded ? ' folded' : ''}`}
      style={dock.folded ? undefined : { height }}
    >
      {!dock.folded && (
        <PanelResizer
          label="Todos height"
          panel="below"
          size={height}
          min={DOCK_MIN}
          max={max}
          onResize={(size) => onDock({ height: size }, false)}
          onResized={(size) => onDock({ height: size })}
        />
      )}
      <button
        className="todo-dock-header"
        aria-expanded={!dock.folded}
        title={dock.folded ? 'Raise the Todos' : 'Fold the Todos'}
        onClick={() => onDock({ folded: !dock.folded })}
      >
        <span className="todo-dock-arrow" aria-hidden="true">
          {dock.folded ? '▸' : '▾'}
        </span>{' '}
        Todos · {count}
      </button>
      {!dock.folded && (
        <div className="todo-dock-body">
          <TodoList
            todos={todos}
            names={names}
            prelink={prelink}
            draft={draft}
            scope={dock.scope}
            onScope={(scope) => onDock({ scope })}
            onOpen={onOpen}
            onOpenTrash={onOpenTrash}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A ref for the dock, and the most height it may take: its pane's, less the
 * pane's tab bar and the least the tab needs, followed as the window resizes.
 */
function useMostHeight(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [most, setMost] = useState(Infinity);
  useEffect(() => {
    const pane = ref.current?.parentElement;
    if (!pane) return;
    const measure = () => {
      const bar = pane.querySelector<HTMLElement>('.left-pane-bar');
      setMost(pane.clientHeight - (bar?.offsetHeight ?? 0) - TAB_MIN);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);
  return [ref, most];
}
