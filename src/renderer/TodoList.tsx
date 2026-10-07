import {
  useContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { CallFailure } from '../shared/bridge';
import {
  linkedTo,
  linkView,
  type LinkNames,
  type Todo,
  type TodoLink,
} from '../shared/todo';
import { inLowerHalf } from './Binder';
import { ReadOnlyContext } from './read-only';

const TODO = 'application/x-scaffold-todo';

/**
 * A Todo the Author started from elsewhere, as by Add Todo… or Ctrl+T: the
 * New Todo field takes its link, its text when it has one, and focus.
 * `count` asks again for the same.
 */
export type TodoDraft = {
  link: TodoLink | null;
  text?: string;
  count: number;
};

/**
 * The Todos tab: a New Todo field, pre-linked to the open unit, over the
 * Todos not done, in the Author's order, and a folded Done section. Each
 * Todo's link opens its unit, or its Trash item while the unit is in Trash.
 * In Writing, a toggle shows only the open unit's Todos.
 * A read-only Project shows the list and changes nothing.
 */
export function TodoList({
  todos,
  names,
  prelink,
  draft,
  onlyOpen,
  onOnlyOpen,
  onOpen,
  onOpenTrash,
  onError,
}: {
  todos: Todo[];
  names: LinkNames;
  /** What a new Todo links to unless the Author unlinks it: the open unit. */
  prelink: TodoLink | null;
  draft?: TodoDraft;
  /** Whether only the Todos linked to `prelink` show. */
  onlyOpen?: boolean;
  /** Sets `onlyOpen`; without it, there is no toggle. */
  onOnlyOpen?(on: boolean): void;
  onOpen(link: TodoLink): void;
  onOpenTrash(trashId: string): void;
  onError(message: string | null): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const shown = onlyOpen ? linkedTo(todos, prelink) : todos;
  const open = shown.filter((todo) => !todo.done);
  const done = shown.filter((todo) => todo.done);

  /**
   * Runs a change to the Todos, the list showing it following from main;
   * false when it failed, which the Author is told.
   */
  async function run(
    change: () => Promise<void>,
    what: string,
  ): Promise<boolean> {
    try {
      await change();
      onError(null);
      return true;
    } catch (error) {
      onError(`Can't ${what}: ${(error as CallFailure).message}`);
      return false;
    }
  }

  /**
   * Moves the Todo dragged to before or after `target`, among those done as
   * it is, or not, shown or not.
   */
  function drop(id: string, target: Todo, after: boolean) {
    const group = todos.filter((todo) => todo.done === target.done);
    if (id === target.id || !group.some((todo) => todo.id === id)) return;
    const rest = group.filter((todo) => todo.id !== id);
    const at = rest.findIndex((todo) => todo.id === target.id);
    void run(
      () => window.project.moveTodo(id, at + (after ? 1 : 0)),
      'move the Todo',
    );
  }

  /** Moves a Todo past the one shown above or below it, by Alt+↑/↓. */
  function step(todo: Todo, by: -1 | 1) {
    const group = todo.done ? done : open;
    const next = group[group.findIndex((t) => t.id === todo.id) + by];
    if (next) drop(todo.id, next, by === 1);
  }

  const row = (todo: Todo) => (
    <TodoRow
      key={todo.id}
      todo={todo}
      names={names}
      readOnly={readOnly}
      run={run}
      onOpen={onOpen}
      onOpenTrash={onOpenTrash}
      onDrop={drop}
      onStep={step}
    />
  );

  return (
    <section className="todos" aria-label="Todos">
      <NewTodo
        names={names}
        prelink={prelink}
        draft={draft}
        readOnly={readOnly}
        onAdd={(text, link) =>
          run(() => window.project.addTodo(text, link), 'add the Todo')
        }
      />
      {onOnlyOpen && (
        <label className="todos-only-open">
          <input
            type="checkbox"
            checked={!!onlyOpen}
            onChange={(event) => onOnlyOpen(event.target.checked)}
          />
          Only the open unit’s Todos
        </label>
      )}
      {open.length > 0 ? (
        <ol className="todo-list" aria-label="To do">
          {open.map(row)}
        </ol>
      ) : (
        <p className="todos-empty">Nothing to do</p>
      )}
      {done.length > 0 && (
        <details className="todo-done">
          <summary>Done ({done.length})</summary>
          <ol className="todo-list" aria-label="Done">
            {done.map(row)}
          </ol>
          <button
            className="todo-clear"
            disabled={readOnly}
            onClick={() =>
              void run(
                // Only those shown: the Author doesn't see the others go.
                async () => {
                  if (!onlyOpen) return window.project.clearDoneTodos();
                  for (const todo of done) {
                    await window.project.deleteTodo(todo.id);
                  }
                },
                'clear the done Todos',
              )
            }
          >
            Clear done
          </button>
        </details>
      )}
    </section>
  );
}

/**
 * The New Todo field. It links what it adds to the open unit, unless a
 * draft brings another link, which holds until it is added, or the Author
 * unlinks it, which holds until another unit opens or it is added.
 */
function NewTodo({
  names,
  prelink,
  draft,
  readOnly,
  onAdd,
}: {
  names: LinkNames;
  prelink: TodoLink | null;
  draft?: TodoDraft;
  readOnly: boolean;
  /** Resolves with whether it was added. */
  onAdd(text: string, link: TodoLink | null): Promise<boolean>;
}) {
  const [text, setText] = useState('');
  /** The link chosen over the open unit: another, or none once unlinked. */
  const [chosen, setChosen] = useState<{ link: TodoLink | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const prelinkKey = prelink && `${prelink.kind}:${prelink.id}`;
  useEffect(
    () => setChosen((now) => (now?.link === null ? null : now)),
    [prelinkKey],
  );
  const draftCount = draft?.count;
  useEffect(() => {
    if (!draft) return;
    setChosen({ link: draft.link });
    if (draft.text !== undefined) setText(draft.text);
    input.current?.focus();
    // Asked for anew by its count alone.
  }, [draftCount]);
  const wanted = chosen ? chosen.link : prelink;
  const view = wanted && linkView(wanted, names);
  const link = view ? wanted : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    // Kept until it is added, so a failed add loses nothing.
    if (!(await onAdd(text, link))) return;
    setText('');
    setChosen(null);
  }

  return (
    <form className="new-todo" onSubmit={(event) => void submit(event)}>
      <input
        ref={input}
        aria-label="New Todo"
        placeholder="New Todo"
        value={text}
        disabled={readOnly}
        onChange={(event) => setText(event.target.value)}
      />
      {view && (
        <span className="new-todo-link">
          <span className="todo-link-arrow" aria-hidden="true">
            ↳
          </span>{' '}
          {view.title}
          <button
            type="button"
            className="new-todo-unlink"
            aria-label={`Unlink from “${view.title}”`}
            title="Unlink"
            disabled={readOnly}
            onClick={() => setChosen({ link: null })}
          >
            ×
          </button>
        </span>
      )}
    </form>
  );
}

function TodoRow({
  todo,
  names,
  readOnly,
  run,
  onOpen,
  onOpenTrash,
  onDrop,
  onStep,
}: {
  todo: Todo;
  names: LinkNames;
  readOnly: boolean;
  run(change: () => Promise<void>, what: string): Promise<boolean>;
  onOpen(link: TodoLink): void;
  onOpenTrash(trashId: string): void;
  onDrop(id: string, target: Todo, after: boolean): void;
  onStep(todo: Todo, by: -1 | 1): void;
}) {
  const [draft, setDraft] = useState(todo.text);
  useEffect(() => setDraft(todo.text), [todo.text]);
  const view = todo.link && linkView(todo.link, names);

  /** Keeps the text edited; with none, the Todo keeps the text it had. */
  function commit() {
    const text = draft.trim();
    if (!text || text === todo.text) {
      setDraft(todo.text);
      return;
    }
    void run(
      () => window.project.changeTodo(todo.id, { text }),
      'change the Todo',
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setDraft(todo.text);
      // Blurred once the text is back, so nothing is kept.
      const input = event.currentTarget;
      setTimeout(() => input.blur());
    } else if (
      event.altKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      !readOnly
    ) {
      event.preventDefault();
      onStep(todo, event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  return (
    <li
      className="todo"
      data-id={todo.id}
      draggable={!readOnly}
      onDragStart={(event) => event.dataTransfer.setData(TODO, todo.id)}
      onDragOver={(event: DragEvent<HTMLLIElement>) => {
        if (event.dataTransfer.types.includes(TODO)) event.preventDefault();
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(TODO);
        if (!id) return;
        event.preventDefault();
        onDrop(id, todo, inLowerHalf(event));
      }}
    >
      {!readOnly && (
        <span className="todo-grip" aria-hidden="true" title="Drag to move">
          ⠿
        </span>
      )}
      <input
        type="checkbox"
        checked={todo.done}
        disabled={readOnly}
        aria-label={`Done: ${todo.text}`}
        onChange={() =>
          void run(
            () => window.project.changeTodo(todo.id, { done: !todo.done }),
            todo.done ? 'untick the Todo' : 'tick the Todo',
          )
        }
      />
      <span className="todo-body">
        <input
          className="todo-text"
          aria-label="Todo"
          title={todo.text}
          value={draft}
          readOnly={readOnly}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {view && todo.link && (
          <button
            className={`todo-link${view.trashId ? ' in-trash' : ''}`}
            onClick={() => {
              const { trashId } = view;
              if (trashId) onOpenTrash(trashId);
              else if (todo.link) onOpen(todo.link);
            }}
          >
            {view.title}
            {view.trashId && ' (in Trash)'}
          </button>
        )}
      </span>
      {!readOnly && (
        <button
          className="todo-delete"
          aria-label={`Delete “${todo.text}”`}
          title="Delete"
          onClick={() =>
            void run(
              () => window.project.deleteTodo(todo.id),
              'delete the Todo',
            )
          }
        >
          ×
        </button>
      )}
    </li>
  );
}
