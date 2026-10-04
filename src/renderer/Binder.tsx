import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import type { Changed, Created } from '../shared/api';
import { SHORTCUTS, shortcutText, withShortcut } from '../shared/shortcuts';
import { MAC } from './platform';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type SceneNode,
} from '../shared/project-types';

/**
 * What the centre shows: a Scene, a Chapter's Outline and Notes, the Project
 * Outline, or an Entry.
 */
export type Selection =
  | { kind: 'scene' | 'chapter' | 'entry'; id: string }
  | { kind: 'project' };

type Props = {
  manuscript: Manuscript;
  selected: Selection | null;
  onSelect(selection: Selection): void;
  /** The Chapters and Scenes, or `PROJECT_OUTLINE`, with a unit in Conflict. */
  conflicted: ReadonlySet<string>;
  /**
   * Runs a structure operation and shows the Manuscript it resolves with;
   * `message` says what it did, beside Undo.
   */
  onChange(operation: () => Promise<Changed>, message: string): Promise<void>;
  /** The Chapter or Scene whose title is being edited, if any. */
  renaming: string | null;
  onRename(id: string | null): void;
};

const SCENE = 'application/x-scaffold-scene';
const CHAPTER = 'application/x-scaffold-chapter';

/** The Manuscript tab: Chapters and their Scenes, then any Unplaced Scenes. */
export function Binder({
  manuscript,
  selected,
  onSelect,
  conflicted,
  onChange,
  renaming,
  onRename: setRenaming,
}: Props) {
  const project = window.project;
  const { chapters } = manuscript;
  const isSelected = (kind: Selection['kind'], id?: string) =>
    selected?.kind === kind && (!id || ('id' in selected && selected.id === id))
      ? 'true'
      : undefined;
  const onOpenScene = (id: string) => onSelect({ kind: 'scene', id });

  async function create(
    operation: () => Promise<Created>,
    message: string,
    then: (id: string) => void,
  ) {
    let id: string | undefined;
    await onChange(async () => {
      const created = await operation();
      id = created.id;
      return created;
    }, message);
    if (id) then(id);
  }

  function rename(id: string, title: string, kind: 'chapter' | 'scene') {
    setRenaming(null);
    void (kind === 'chapter'
      ? onChange(() => project.renameChapter(id, title), 'Chapter renamed')
      : onChange(() => project.renameScene(id, title), 'Scene renamed'));
  }

  function moveScene(sceneId: string, chapterId: string, index: number) {
    return onChange(
      () => project.moveScene(sceneId, chapterId, index),
      'Scene moved',
    );
  }

  function moveChapter(chapterId: string, index: number) {
    return onChange(
      () => project.moveChapter(chapterId, index),
      'Chapter moved',
    );
  }

  function trash(
    node: { id: string; title: string },
    kind: 'scene' | 'chapter',
  ) {
    return onChange(
      () =>
        kind === 'scene'
          ? project.trashScene(node.id)
          : project.trashChapter(node.id),
      `“${node.title}” moved to Trash`,
    );
  }

  /** Drops a Scene before or after `target`, or at the end of a Chapter. */
  function dropScene(
    sceneId: string,
    chapter: ManuscriptChapter,
    target?: SceneNode,
    after = false,
  ) {
    const rest = chapter.scenes.filter((s) => s.id !== sceneId);
    const at = target ? rest.findIndex((s) => s.id === target.id) : rest.length;
    if (at < 0) return;
    void moveScene(sceneId, chapter.id, at + (target && after ? 1 : 0));
  }

  function dropChapter(
    chapterId: string,
    target: ManuscriptChapter,
    after: boolean,
  ) {
    if (chapterId === target.id) return;
    const rest = chapters.filter((c) => c.id !== chapterId);
    const at = rest.findIndex((c) => c.id === target.id);
    void moveChapter(chapterId, at + (after ? 1 : 0));
  }

  function sceneMenu(
    scene: ManuscriptScene,
    chapter: ManuscriptChapter | null,
  ): MenuItem[] {
    const others = chapters.filter((c) => c !== chapter);
    const moves = others.map((c) => ({
      label: `Move to ${c.title}`,
      run: () => moveScene(scene.id, c.id, c.scenes.length),
    }));
    const toTrash = {
      label: 'Move to Trash',
      // A Missing Scene has no Prose here to keep.
      disabled: scene.missing,
      run: () => trash(scene, 'scene'),
    };
    if (!chapter) return [...moves, toTrash];
    const index = chapter.scenes.indexOf(scene);
    return [
      { label: 'Rename…', run: () => setRenaming(scene.id) },
      {
        label: 'New Scene Above',
        shortcut: SHORTCUTS.newSceneAbove,
        run: () =>
          create(
            () => project.createScene(chapter.id, index),
            'Scene created',
            onOpenScene,
          ),
      },
      {
        label: 'New Scene Below',
        shortcut: SHORTCUTS.newScene,
        run: () =>
          create(
            () => project.createScene(chapter.id, index + 1),
            'Scene created',
            onOpenScene,
          ),
      },
      {
        label: 'Move Up',
        disabled: index === 0,
        run: () => moveScene(scene.id, chapter.id, index - 1),
      },
      {
        label: 'Move Down',
        disabled: index === chapter.scenes.length - 1,
        run: () => moveScene(scene.id, chapter.id, index + 1),
      },
      ...moves,
      toTrash,
    ];
  }

  function chapterMenu(chapter: ManuscriptChapter, index: number): MenuItem[] {
    return [
      { label: 'Rename…', run: () => setRenaming(chapter.id) },
      {
        label: 'New Scene',
        shortcut: SHORTCUTS.newScene,
        run: () =>
          create(
            () => project.createScene(chapter.id, chapter.scenes.length),
            'Scene created',
            onOpenScene,
          ),
      },
      {
        label: 'New Chapter Above',
        shortcut: SHORTCUTS.newChapterAbove,
        run: () =>
          create(
            () => project.createChapter(index),
            'Chapter created',
            setRenaming,
          ),
      },
      {
        label: 'New Chapter Below',
        shortcut: SHORTCUTS.newChapter,
        run: () =>
          create(
            () => project.createChapter(index + 1),
            'Chapter created',
            setRenaming,
          ),
      },
      {
        label: 'Move Up',
        disabled: index === 0,
        run: () => moveChapter(chapter.id, index - 1),
      },
      {
        label: 'Move Down',
        disabled: index === chapters.length - 1,
        run: () => moveChapter(chapter.id, index + 1),
      },
      {
        label: 'Move to Trash',
        // The Manuscript keeps at least one Chapter, and a Missing Scene has
        // no Prose here to keep.
        disabled:
          chapters.length === 1 || chapter.scenes.some((s) => s.missing),
        run: () => trash(chapter, 'chapter'),
      },
    ];
  }

  function sceneRow(scene: ManuscriptScene, chapter: ManuscriptChapter | null) {
    return (
      <li
        key={scene.id}
        className="binder-scene"
        data-kind="scene"
        data-id={scene.id}
        draggable={renaming !== scene.id}
        onDragStart={(event) => event.dataTransfer.setData(SCENE, scene.id)}
        onDragOver={(event) => {
          if (chapter && event.dataTransfer.types.includes(SCENE))
            event.preventDefault();
        }}
        onDrop={(event) => {
          if (!chapter) return;
          event.preventDefault();
          event.stopPropagation();
          const sceneId = event.dataTransfer.getData(SCENE);
          if (sceneId && sceneId !== scene.id)
            dropScene(sceneId, chapter, scene, inLowerHalf(event));
        }}
      >
        {renaming === scene.id ? (
          <TitleInput
            title={scene.title}
            onDone={(title) =>
              title ? rename(scene.id, title, 'scene') : setRenaming(null)
            }
          />
        ) : (
          <button
            className="binder-title"
            aria-current={isSelected('scene', scene.id)}
            onClick={() => onOpenScene(scene.id)}
            onDoubleClick={() => chapter && setRenaming(scene.id)}
          >
            {scene.title}
            {scene.missing && (
              <span className="binder-missing">
                {' '}
                Missing, possibly not synced yet
              </span>
            )}
            <ConflictMarker shown={conflicted.has(scene.id)} />
          </button>
        )}
        <Menu
          label={`Scene actions: ${scene.title}`}
          items={sceneMenu(scene, chapter)}
        />
      </li>
    );
  }

  return (
    <nav className="binder" aria-label="Manuscript">
      <button
        className="binder-project"
        aria-current={isSelected('project')}
        onClick={() => onSelect({ kind: 'project' })}
      >
        Project Outline
        <ConflictMarker shown={conflicted.has(PROJECT_OUTLINE)} />
      </button>
      <ol className="binder-chapters">
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            className="binder-chapter"
            data-kind="chapter"
            data-id={chapter.id}
            aria-label={chapter.title}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(SCENE))
                event.preventDefault();
            }}
            onDrop={(event) => {
              const sceneId = event.dataTransfer.getData(SCENE);
              if (!sceneId) return;
              event.preventDefault();
              dropScene(sceneId, chapter);
            }}
          >
            <div
              className="binder-chapter-head"
              draggable={renaming !== chapter.id}
              onDragStart={(event) =>
                event.dataTransfer.setData(CHAPTER, chapter.id)
              }
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(CHAPTER))
                  event.preventDefault();
              }}
              onDrop={(event) => {
                const chapterId = event.dataTransfer.getData(CHAPTER);
                if (!chapterId) return;
                event.preventDefault();
                event.stopPropagation();
                dropChapter(chapterId, chapter, inLowerHalf(event));
              }}
            >
              {renaming === chapter.id ? (
                <TitleInput
                  title={chapter.title}
                  onDone={(title) =>
                    title
                      ? rename(chapter.id, title, 'chapter')
                      : setRenaming(null)
                  }
                />
              ) : (
                <h2 className="binder-title">
                  <button
                    aria-current={isSelected('chapter', chapter.id)}
                    onClick={() =>
                      onSelect({ kind: 'chapter', id: chapter.id })
                    }
                    onDoubleClick={() => setRenaming(chapter.id)}
                  >
                    {chapter.title}
                    <ConflictMarker shown={conflicted.has(chapter.id)} />
                  </button>
                </h2>
              )}
              <Menu
                label={`Chapter actions: ${chapter.title}`}
                items={chapterMenu(chapter, index)}
              />
            </div>
            <ol className="binder-scenes">
              {chapter.scenes.map((scene) => sceneRow(scene, chapter))}
            </ol>
          </li>
        ))}
      </ol>
      <button
        className="binder-add"
        title={withShortcut('New Chapter', SHORTCUTS.newChapter, MAC)}
        onClick={() =>
          create(
            () => project.createChapter(chapters.length),
            'Chapter created',
            setRenaming,
          )
        }
      >
        New Chapter
      </button>
      {manuscript.unplaced.length > 0 && (
        <section className="binder-unplaced" aria-label="Unplaced Scenes">
          <h2>Unplaced Scenes</h2>
          <ol className="binder-scenes">
            {manuscript.unplaced.map((scene) => sceneRow(scene, null))}
          </ol>
        </section>
      )}
    </nav>
  );
}

/** Marks a unit in Conflict; it stays editable. */
export function ConflictMarker({ shown }: { shown: boolean }) {
  return shown ? <span className="binder-conflict"> Conflict</span> : null;
}

function inLowerHalf(event: DragEvent<HTMLElement>): boolean {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
}

/** Edits a title in place: Enter or leaving the field keeps it, Escape cancels. */
export function TitleInput({
  title,
  onDone,
}: {
  title: string;
  onDone(title: string | null): void;
}) {
  const [value, setValue] = useState(title);
  const done = useRef(false);
  function finish(result: string | null) {
    if (done.current) return;
    done.current = true;
    onDone(result === title ? null : result);
  }
  return (
    <input
      className="binder-rename"
      aria-label="Title"
      autoFocus
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(value.trim() || null);
        if (event.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(value.trim() || null)}
    />
  );
}

export type MenuItem = {
  label: string;
  run(): unknown;
  disabled?: boolean;
  /** The keys that do the same for the row with focus, as an accelerator. */
  shortcut?: string;
};

/** Keys as `aria-keyshortcuts` names them, such as Control+Shift+Enter. */
function ariaKeys(text: string): string {
  return text.replace('Ctrl', 'Control').replace('⌘', 'Meta');
}

/** A button that opens `items`; it shows `children`, or ⋯ when there are none. */
export function Menu({
  label,
  items,
  children,
  title,
}: {
  label: string;
  items: MenuItem[];
  children?: ReactNode;
  /** The button's tooltip, such as its shortcut. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        className="menu-button"
        aria-label={label}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {children ?? '⋯'}
      </button>
      {open && (
        <div
          role="menu"
          className="menu-items"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              aria-keyshortcuts={
                item.shortcut && ariaKeys(shortcutText(item.shortcut, MAC))
              }
              onClick={() => {
                setOpen(false);
                void item.run();
              }}
            >
              {item.label}
              {item.shortcut && (
                // Shown, not part of the item's name.
                <span className="menu-shortcut" aria-hidden="true">
                  {shortcutText(item.shortcut, MAC)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
