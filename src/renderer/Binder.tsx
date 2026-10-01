import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Created } from '../shared/api';
import type {
  Manuscript,
  ManuscriptChapter,
  ManuscriptScene,
  SceneNode,
} from '../shared/project-types';

type Props = {
  manuscript: Manuscript;
  openSceneId: string | null;
  onOpenScene(sceneId: string): void;
  /** Runs a structure operation and shows the Manuscript it resolves with. */
  onChange(operation: () => Promise<Manuscript | Created>): Promise<void>;
};

/** What is being renamed: a Chapter or Scene id. */
type Renaming = string | null;

const SCENE = 'application/x-writing-tools-scene';
const CHAPTER = 'application/x-writing-tools-chapter';

/** The Manuscript tab: Chapters and their Scenes, then any Unplaced Scenes. */
export function Binder({
  manuscript,
  openSceneId,
  onOpenScene,
  onChange,
}: Props) {
  const [renaming, setRenaming] = useState<Renaming>(null);
  const project = window.project;
  const { chapters } = manuscript;

  async function create(
    operation: () => Promise<Created>,
    then: (id: string) => void,
  ) {
    let id: string | undefined;
    await onChange(async () => {
      const created = await operation();
      id = created.id;
      return created;
    });
    if (id) then(id);
  }

  function rename(id: string, title: string, kind: 'chapter' | 'scene') {
    setRenaming(null);
    void onChange(() =>
      kind === 'chapter'
        ? project.renameChapter(id, title)
        : project.renameScene(id, title),
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
    void onChange(() =>
      project.moveScene(sceneId, chapter.id, at + (target && after ? 1 : 0)),
    );
  }

  function dropChapter(
    chapterId: string,
    target: ManuscriptChapter,
    after: boolean,
  ) {
    if (chapterId === target.id) return;
    const rest = chapters.filter((c) => c.id !== chapterId);
    const at = rest.findIndex((c) => c.id === target.id);
    void onChange(() => project.moveChapter(chapterId, at + (after ? 1 : 0)));
  }

  function sceneMenu(
    scene: SceneNode,
    chapter: ManuscriptChapter | null,
  ): MenuItem[] {
    const others = chapters.filter((c) => c !== chapter);
    const moves = others.map((c) => ({
      label: `Move to ${c.title}`,
      run: () =>
        onChange(() => project.moveScene(scene.id, c.id, c.scenes.length)),
    }));
    if (!chapter) return moves;
    const index = chapter.scenes.indexOf(scene);
    return [
      { label: 'Rename…', run: () => setRenaming(scene.id) },
      {
        label: 'New Scene Above',
        run: () =>
          create(() => project.createScene(chapter.id, index), onOpenScene),
      },
      {
        label: 'New Scene Below',
        run: () =>
          create(() => project.createScene(chapter.id, index + 1), onOpenScene),
      },
      {
        label: 'Move Up',
        disabled: index === 0,
        run: () =>
          onChange(() => project.moveScene(scene.id, chapter.id, index - 1)),
      },
      {
        label: 'Move Down',
        disabled: index === chapter.scenes.length - 1,
        run: () =>
          onChange(() => project.moveScene(scene.id, chapter.id, index + 1)),
      },
      ...moves,
    ];
  }

  function chapterMenu(chapter: ManuscriptChapter, index: number): MenuItem[] {
    return [
      { label: 'Rename…', run: () => setRenaming(chapter.id) },
      {
        label: 'New Scene',
        run: () =>
          create(
            () => project.createScene(chapter.id, chapter.scenes.length),
            onOpenScene,
          ),
      },
      {
        label: 'New Chapter Above',
        run: () => create(() => project.createChapter(index), setRenaming),
      },
      {
        label: 'New Chapter Below',
        run: () => create(() => project.createChapter(index + 1), setRenaming),
      },
      {
        label: 'Move Up',
        disabled: index === 0,
        run: () => onChange(() => project.moveChapter(chapter.id, index - 1)),
      },
      {
        label: 'Move Down',
        disabled: index === chapters.length - 1,
        run: () => onChange(() => project.moveChapter(chapter.id, index + 1)),
      },
    ];
  }

  function sceneRow(scene: ManuscriptScene, chapter: ManuscriptChapter | null) {
    return (
      <li
        key={scene.id}
        className="binder-scene"
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
            aria-current={scene.id === openSceneId ? 'true' : undefined}
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
      <ol className="binder-chapters">
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            className="binder-chapter"
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
                <h2
                  className="binder-title"
                  onDoubleClick={() => setRenaming(chapter.id)}
                >
                  {chapter.title}
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
        onClick={() =>
          create(() => project.createChapter(chapters.length), setRenaming)
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

function inLowerHalf(event: DragEvent<HTMLElement>): boolean {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
}

/** Edits a title in place: Enter or leaving the field keeps it, Escape cancels. */
function TitleInput({
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

type MenuItem = { label: string; run(): unknown; disabled?: boolean };

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
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
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
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
              onClick={() => {
                setOpen(false);
                void item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
