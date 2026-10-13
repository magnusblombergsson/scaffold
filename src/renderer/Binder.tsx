import {
  useContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { Changed, Created } from '../shared/api';
import {
  bookMove,
  chapterMove,
  listRows,
  partMove,
  sceneMove,
  type Direction,
  type Row,
} from './binder-keys';
import { useListKeys } from './list-keys';
import {
  bookManuscript,
  partOf,
  placedChapters,
  topItems,
  topLength,
  unplacedChapters,
} from '../shared/manuscript-order';
import { SHORTCUTS, shortcutText, withShortcut } from '../shared/shortcuts';
import { MAC } from './platform';
import { ReadOnlyContext } from './read-only';
import { statusOf, type Status } from '../shared/status';
import type { TodoLink } from '../shared/todo';
import { unitImageItems } from './UnitImage';
import { useImagePicker } from './ImagePicker';
import {
  partName,
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptBook,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
  type SceneNode,
} from '../shared/project-types';

/**
 * What Writing's centre shows: a Scene, a Chapter's, Part's or Book's
 * Outline and Notes, or the Project Outline. Entries open in the Story
 * Bible.
 */
export type Selection =
  | { kind: 'scene' | 'chapter' | 'part' | 'book'; id: string }
  | { kind: 'project' };

type Props = {
  manuscript: Manuscript;
  selected: Selection | null;
  onSelect(selection: Selection): void;
  /** The Parts, Chapters and Scenes, or `PROJECT_OUTLINE`, with a unit in Conflict. */
  conflicted: ReadonlySet<string>;
  /**
   * Runs a structure operation and shows the Manuscript it resolves with;
   * `message` says what it did, beside Undo.
   */
  onChange(operation: () => Promise<Changed>, message: string): Promise<void>;
  /** The Book, Part, Chapter or Scene whose title is being edited, if any. */
  renaming: string | null;
  onRename(id: string | null): void;
  /** Undoes the last structure change, as Ctrl+Z in the list does. */
  onUndo(): Promise<void>;
  /** The Project's Status list, in order. */
  statuses: Status[];
  /** Gives a Book, Part, Chapter or Scene a Status, or none with null. */
  onSetStatus(unitId: string, statusId: string | null): void;
  /** Opens Tags… on a Book, Part, Chapter or Scene. */
  onEditTags(unitId: string): void;
  /** Opens Set word target… on a Book, Part, Chapter or Scene. */
  onSetWordTarget(unitId: string): void;
  /** Starts a Todo linked to a Book, Part, Chapter or Scene. */
  onAddTodo(link: TodoLink): void;
};

const SCENE = 'application/x-scaffold-scene';
const CHAPTER = 'application/x-scaffold-chapter';
const PART = 'application/x-scaffold-part';
const BOOK = 'application/x-scaffold-book';

/**
 * The Manuscript tab: the Parts, each with its Chapters, and the Loose
 * Chapters in one order, each Chapter with its Scenes; then any Unplaced
 * Chapters and Unplaced Scenes. Without Parts, just the Chapters. In a
 * Series, each Book is a foldable top level holding its own.
 */
export function Binder({
  manuscript,
  selected,
  onSelect,
  conflicted,
  onChange,
  renaming,
  onRename: setRenaming,
  onUndo,
  statuses,
  onSetStatus,
  onEditTags,
  onSetWordTarget,
  onAddTodo,
}: Props) {
  const project = window.project;
  const readOnly = useContext(ReadOnlyContext);
  const imagePicker = useImagePicker();
  const { chapters, parts = [], books } = manuscript;
  /** What the Project calls a Part, as in “Act”. */
  const name = partName(manuscript.partLabel);
  /** The Books and Parts whose Chapters are hidden. In memory while the tab shows. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const expand = (id: string) =>
    setCollapsed((now) => new Set([...now].filter((other) => other !== id)));
  const rows = listRows(manuscript, collapsed);
  /**
   * A Book of a Series on its own, or with no `bookId` the Manuscript of a
   * Project that is no Series: what moving within it works on.
   */
  const ofBook = (bookId?: string) => bookManuscript(manuscript, bookId);
  /** The ids of the Parts and Loose Chapters of Book `bookId`, or of the Manuscript, in order. */
  const topIds = (bookId?: string) => {
    const book = ofBook(bookId);
    return book.top ?? placedChapters(book).map((c) => c.id);
  };
  /** The Book a new Chapter or Part goes in from the end of the list: the last. */
  const lastBook = books?.[books.length - 1];
  /** The row whose ⋯ menu is open, as by Shift+F10. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** Whether a row is a Part or Chapter or a Scene in one: Unplaced Scenes ignore F2 and Alt+↑/↓. */
  const placed = (row: Row) => row.kind !== 'scene' || row.chapterId !== null;
  const keys = useListKeys(rows, {
    rename: (row) => {
      if (placed(row)) setRenaming(row.id);
    },
    move: (row, direction) => move(row, direction) ?? Promise.resolve(),
    menu: (row) => setMenuFor(row.id),
    undo: onUndo,
  });
  /** What lets a row open its ⋯ menu, as Shift+F10 does, and Escape come back to it. */
  const rowMenu = (id: string) => ({
    open: menuFor === id,
    onOpenChange: (open: boolean) => setMenuFor(open ? id : null),
    returnFocus: () => keys.focusRow(id),
  });
  const onContextMenu = (id: string) => (event: ReactMouseEvent<HTMLElement>) =>
    keys.onContextMenu(event, menuFor === id, () => setMenuFor(id));
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

  function rename(
    id: string,
    title: string,
    kind: 'book' | 'part' | 'chapter' | 'scene',
  ) {
    setRenaming(null);
    void (kind === 'book'
      ? onChange(() => project.renameBook(id, title), 'Book renamed')
      : kind === 'part'
        ? onChange(() => project.renamePart(id, title), `${name} renamed`)
        : kind === 'chapter'
          ? onChange(() => project.renameChapter(id, title), 'Chapter renamed')
          : onChange(() => project.renameScene(id, title), 'Scene renamed'));
  }

  function moveScene(sceneId: string, chapterId: string, index: number) {
    return onChange(
      () => project.moveScene(sceneId, chapterId, index),
      'Scene moved',
    );
  }

  /**
   * Moves a Chapter to `index` in a Part, which then shows its Chapters, or
   * at the top of Book `bookId`, which then shows its own, or of its own.
   */
  function moveChapter(
    chapterId: string,
    index: number,
    partId?: string,
    bookId?: string,
  ) {
    if (partId) expand(partId);
    if (bookId) expand(bookId);
    return onChange(
      () => project.moveChapter(chapterId, index, partId, bookId),
      'Chapter moved',
    );
  }

  /** Moves a Part to `index` at the top of Book `bookId`, which then shows its own, or of its own. */
  function movePart(partId: string, index: number, bookId?: string) {
    if (bookId) expand(bookId);
    return onChange(
      () => project.movePart(partId, index, bookId),
      `${name} moved`,
    );
  }

  function moveBook(bookId: string, index: number) {
    return onChange(() => project.moveBook(bookId, index), 'Book moved');
  }

  /**
   * Moves a Book, a Part or a Chapter within its Book, or a Scene across
   * Chapters, a place up or down; undefined at either end.
   */
  function move(row: Row, direction: Direction) {
    if (row.kind === 'book') {
      const to = bookMove(manuscript, row.id, direction);
      return to === null ? undefined : moveBook(row.id, to);
    }
    if (row.kind === 'part') {
      const bookId = bookOfRow(row);
      const to = partMove(ofBook(bookId), row.id, direction);
      return to === null ? undefined : movePart(row.id, to, bookId);
    }
    if (row.kind === 'chapter') {
      const bookId = bookOfRow(row);
      const to = chapterMove(ofBook(bookId), row.id, direction);
      return to ? moveChapter(row.id, to.index, to.partId, bookId) : undefined;
    }
    const to = sceneMove(manuscript, row.id, direction);
    if (!to) return undefined;
    const part = partOf(manuscript, to.chapterId);
    if (part) expand(part.id);
    return moveScene(row.id, to.chapterId, to.index);
  }

  /** The Book a Part's or Chapter's row is in, in a Series. */
  function bookOfRow(row: Row): string | undefined {
    if (row.kind === 'part') return parts.find((p) => p.id === row.id)?.book;
    if (row.kind === 'chapter') {
      return chapters.find((c) => c.id === row.id)?.book;
    }
    return undefined;
  }

  /** The ⋯ menu's Move Up and Move Down, after which the row keeps the highlight. */
  function moveItems(row: Row): MenuItem[] {
    return (['up', 'down'] as const).map((direction) => ({
      label: direction === 'up' ? 'Move Up' : 'Move Down',
      shortcut: direction === 'up' ? SHORTCUTS.moveUp : SHORTCUTS.moveDown,
      disabled:
        row.kind === 'book'
          ? bookMove(manuscript, row.id, direction) === null
          : row.kind === 'part'
            ? partMove(ofBook(bookOfRow(row)), row.id, direction) === null
            : row.kind === 'chapter'
              ? chapterMove(ofBook(bookOfRow(row)), row.id, direction) === null
              : !sceneMove(manuscript, row.id, direction),
      run: () => move(row, direction)?.then(() => keys.focusRow(row.id)),
    }));
  }

  /**
   * Move to Book ▸, in a Series: a Scene goes last in the Book's last
   * Chapter, a Chapter or Part last among its Parts and Loose Chapters.
   * Only `own`, the Book it is loose in, isn't offered.
   * They keep their Outline, Notes, details and image.
   */
  function moveToBookItem(
    node: { id: string },
    kind: 'scene' | 'chapter' | 'part',
    own: string | undefined,
  ): MenuItem[] {
    if (!books) return [];
    return [
      {
        label: 'Move to Book',
        disabled: readOnly,
        items: books.map((book) => {
          const last = ofBook(book.id).chapters.at(-1);
          return {
            label: book.title,
            disabled: book.id === own || (kind === 'scene' && !last),
            run: () =>
              kind === 'scene'
                ? last && moveScene(node.id, last.id, last.scenes.length)
                : kind === 'chapter'
                  ? moveChapter(node.id, book.top.length, undefined, book.id)
                  : movePart(node.id, book.top.length, book.id),
          };
        }),
      },
    ];
  }

  function trash(
    node: { id: string; title: string },
    kind: 'scene' | 'chapter' | 'part' | 'book',
  ) {
    return onChange(
      () =>
        kind === 'scene'
          ? project.trashScene(node.id)
          : kind === 'chapter'
            ? project.trashChapter(node.id)
            : kind === 'part'
              ? project.trashPart(node.id)
              : project.trashBook(node.id),
      `“${node.title}” moved to Trash`,
    );
  }

  /** Move to Trash, and beside it Move to Drawer, which takes the same with it. */
  function outOfStoryItems(
    node: { id: string; title: string },
    kind: 'scene' | 'chapter' | 'part' | 'book',
    disabled: boolean,
  ): MenuItem[] {
    return [
      { label: 'Move to Trash', disabled, run: () => trash(node, kind) },
      {
        label: 'Move to Drawer',
        disabled,
        run: () =>
          onChange(
            () => project.moveToDrawer(kind, node.id),
            `“${node.title}” moved to the Drawer`,
          ),
      },
    ];
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

  /** Drops a Chapter before or after `target`, in its Part or at the top of its Book. */
  function dropChapter(
    chapterId: string,
    target: ManuscriptChapter,
    after: boolean,
  ) {
    if (chapterId === target.id || target.unplaced) return;
    const part = partOf(manuscript, target.id);
    const rest = (part ? part.chapters : topIds(target.book)).filter(
      (id) => id !== chapterId,
    );
    const at = rest.indexOf(target.id);
    if (at < 0) return;
    void moveChapter(chapterId, at + (after ? 1 : 0), part?.id, target.book);
  }

  /** Drops a Chapter or Part last in a Book, or a Book before or after it. */
  function dropOnBook(event: DragEvent<HTMLElement>, book: ManuscriptBook) {
    const { dataTransfer } = event;
    const chapterId = dataTransfer.getData(CHAPTER);
    const partId = dataTransfer.getData(PART);
    const bookId = dataTransfer.getData(BOOK);
    if (chapterId) {
      const rest = book.top.filter((id) => id !== chapterId);
      void moveChapter(chapterId, rest.length, undefined, book.id);
    } else if (partId) {
      const rest = book.top.filter((id) => id !== partId);
      void movePart(partId, rest.length, book.id);
    } else if (bookId && bookId !== book.id && books) {
      const rest = books.filter((b) => b.id !== bookId);
      const at = rest.indexOf(book);
      void moveBook(bookId, at + (inLowerHalf(event) ? 1 : 0));
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  /** Drops a Chapter into a Part, last. */
  function dropIntoPart(chapterId: string, part: ManuscriptPart) {
    const rest = part.chapters.filter((id) => id !== chapterId);
    void moveChapter(chapterId, rest.length, part.id);
  }

  /** Drops a Part before or after a Part or Loose Chapter, in its Book. */
  function dropPart(
    partId: string,
    targetId: string,
    after: boolean,
    bookId?: string,
  ) {
    if (partId === targetId) return;
    const rest = topIds(bookId).filter((id) => id !== partId);
    const at = rest.indexOf(targetId);
    if (at < 0) return;
    void movePart(partId, at + (after ? 1 : 0), bookId);
  }

  /** The Status ▸ submenu: none, or one of the list. */
  function statusItem(node: { id: string; status?: string }): MenuItem {
    return {
      label: 'Status',
      disabled: readOnly,
      items: statusChoices(statuses, node.status, (statusId) =>
        onSetStatus(node.id, statusId),
      ),
    };
  }

  function tagsItem(node: { id: string }): MenuItem {
    return {
      label: 'Tags…',
      disabled: readOnly,
      run: () => onEditTags(node.id),
    };
  }

  function wordTargetItem(node: { id: string }): MenuItem {
    return {
      label: 'Set word target…',
      disabled: readOnly,
      run: () => onSetWordTarget(node.id),
    };
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
    // A Missing Scene has no Prose here to keep.
    const toTrash = outOfStoryItems(scene, 'scene', scene.missing === true);
    if (!chapter) {
      return [
        statusItem(scene),
        tagsItem(scene),
        wordTargetItem(scene),
        ...unitImageItems(scene, readOnly, imagePicker),
        addTodoItem(readOnly, () => onAddTodo({ kind: 'scene', id: scene.id })),
        ...moves,
        ...moveToBookItem(scene, 'scene', undefined),
        ...toTrash,
      ];
    }
    const index = chapter.scenes.indexOf(scene);
    return [
      {
        label: 'Rename…',
        shortcut: SHORTCUTS.rename,
        run: () => setRenaming(scene.id),
      },
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
      ...moveItems({ kind: 'scene', id: scene.id, chapterId: chapter.id }),
      ...moves,
      ...moveToBookItem(scene, 'scene', chapter.book),
      statusItem(scene),
      tagsItem(scene),
      wordTargetItem(scene),
      ...unitImageItems(scene, readOnly, imagePicker),
      addTodoItem(readOnly, () => onAddTodo({ kind: 'scene', id: scene.id })),
      ...toTrash,
    ];
  }

  /**
   * Moving a Chapter into another Part, last, out of its own, loose right
   * after it, or for an Unplaced Chapter, to the end of the Manuscript, or
   * of the last Book.
   */
  function chapterPlaceItems(
    chapter: ManuscriptChapter,
    part: ManuscriptPart | undefined,
  ): MenuItem[] {
    return [
      ...(chapter.unplaced
        ? [
            {
              label: 'Place at End',
              run: () =>
                moveChapter(
                  chapter.id,
                  topLength(ofBook(lastBook?.id)),
                  undefined,
                  lastBook?.id,
                ),
            },
          ]
        : []),
      ...(part
        ? [
            {
              label: `Move out of ${part.title}`,
              run: () =>
                moveChapter(
                  chapter.id,
                  topIds(part.book).indexOf(part.id) + 1,
                  undefined,
                  part.book,
                ),
            },
          ]
        : []),
      ...parts
        .filter((p) => p !== part)
        .map((p) => ({
          // In a Series, Parts of several Books may share a title.
          label: books
            ? `Move to ${p.title} (${books.find((b) => b.id === p.book)?.title ?? 'no Book'})`
            : `Move to ${p.title}`,
          run: () => dropIntoPart(chapter.id, p),
        })),
    ];
  }

  function chapterMenu(
    chapter: ManuscriptChapter,
    part: ManuscriptPart | undefined,
  ): MenuItem[] {
    /** Where it is among its Part's Chapters, or its Book's Parts and Loose Chapters. */
    const index = (part ? part.chapters : topIds(chapter.book)).indexOf(
      chapter.id,
    );
    const createChapter = (at: number) =>
      create(
        () => project.createChapter(at, undefined, part?.id, chapter.book),
        'Chapter created',
        setRenaming,
      );
    return [
      {
        label: 'Rename…',
        shortcut: SHORTCUTS.rename,
        run: () => setRenaming(chapter.id),
      },
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
      ...(chapter.unplaced
        ? []
        : [
            {
              label: 'New Chapter Above',
              shortcut: SHORTCUTS.newChapterAbove,
              run: () => createChapter(index),
            },
            {
              label: 'New Chapter Below',
              shortcut: SHORTCUTS.newChapter,
              run: () => createChapter(index + 1),
            },
            ...moveItems({
              kind: 'chapter',
              id: chapter.id,
              ...(part && { partId: part.id }),
            }),
          ]),
      ...chapterPlaceItems(chapter, part),
      // Out of its Part too, loose at the end of the Book.
      ...moveToBookItem(chapter, 'chapter', part ? undefined : chapter.book),
      statusItem(chapter),
      tagsItem(chapter),
      wordTargetItem(chapter),
      ...unitImageItems(chapter, readOnly, imagePicker),
      addTodoItem(readOnly, () =>
        onAddTodo({ kind: 'chapter', id: chapter.id }),
      ),
      // The Manuscript keeps at least one Chapter, and a Missing Scene has
      // no Prose here to keep.
      ...outOfStoryItems(
        chapter,
        'chapter',
        chapters.length === 1 || chapter.scenes.some((s) => s.missing),
      ),
    ];
  }

  function partMenu(part: ManuscriptPart): MenuItem[] {
    const index = topIds(part.book).indexOf(part.id);
    const inPart = chapters.filter((c) => part.chapters.includes(c.id));
    const createPart = (at: number) =>
      create(
        () => project.createPart(at, undefined, part.book),
        `${name} created`,
        setRenaming,
      );
    return [
      {
        label: 'Rename…',
        shortcut: SHORTCUTS.rename,
        run: () => setRenaming(part.id),
      },
      {
        label: 'New Chapter',
        run: () => {
          expand(part.id);
          return create(
            () =>
              project.createChapter(part.chapters.length, undefined, part.id),
            'Chapter created',
            setRenaming,
          );
        },
      },
      { label: `New ${name} Above`, run: () => createPart(index) },
      { label: `New ${name} Below`, run: () => createPart(index + 1) },
      ...moveItems({ kind: 'part', id: part.id }),
      ...moveToBookItem(part, 'part', part.book),
      statusItem(part),
      tagsItem(part),
      wordTargetItem(part),
      ...unitImageItems(part, readOnly, imagePicker),
      addTodoItem(readOnly, () => onAddTodo({ kind: 'part', id: part.id })),
      // Its Chapters and their Scenes go with it: the Manuscript keeps at
      // least one Chapter, and a Missing Scene has no Prose here to keep.
      ...outOfStoryItems(
        part,
        'part',
        inPart.length === chapters.length ||
          inPart.some((c) => c.scenes.some((s) => s.missing)),
      ),
    ];
  }

  function bookMenu(book: ManuscriptBook): MenuItem[] {
    const index = books?.indexOf(book) ?? 0;
    const inBook = chapters.filter((c) => c.book === book.id);
    const createBook = (at: number) =>
      create(() => project.createBook(at), 'Book created', setRenaming);
    return [
      {
        label: 'Rename…',
        shortcut: SHORTCUTS.rename,
        run: () => setRenaming(book.id),
      },
      {
        label: 'New Chapter',
        run: () => {
          expand(book.id);
          return create(
            () =>
              project.createChapter(
                book.top.length,
                undefined,
                undefined,
                book.id,
              ),
            'Chapter created',
            setRenaming,
          );
        },
      },
      {
        label: `New ${name}`,
        run: () => {
          expand(book.id);
          return create(
            () => project.createPart(book.top.length, undefined, book.id),
            `${name} created`,
            setRenaming,
          );
        },
      },
      { label: 'New Book Above', run: () => createBook(index) },
      { label: 'New Book Below', run: () => createBook(index + 1) },
      ...moveItems({ kind: 'book', id: book.id }),
      statusItem(book),
      tagsItem(book),
      wordTargetItem(book),
      ...unitImageItems(book, readOnly, imagePicker),
      addTodoItem(readOnly, () => onAddTodo({ kind: 'book', id: book.id })),
      // Its Parts, Chapters and their Scenes go with it: the Project keeps
      // at least one Book and one Chapter, and a Missing Scene has no Prose
      // here to keep.
      ...outOfStoryItems(
        book,
        'book',
        (books?.length ?? 0) <= 1 ||
          inBook.length === chapters.length ||
          inBook.some((c) => c.scenes.some((s) => s.missing)),
      ),
    ];
  }

  function sceneRow(scene: ManuscriptScene, chapter: ManuscriptChapter | null) {
    return (
      <li
        key={scene.id}
        className="binder-scene"
        data-kind="scene"
        data-id={scene.id}
        onContextMenu={onContextMenu(scene.id)}
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
        <StatusDot status={statusOf(statuses, scene.status)} />
        {renaming === scene.id ? (
          <TitleInput
            title={scene.title}
            onDone={(title, byKey) => {
              if (title) rename(scene.id, title, 'scene');
              else setRenaming(null);
              if (byKey) keys.focusRow(scene.id);
            }}
          />
        ) : (
          <button
            className="binder-title"
            data-row={scene.id}
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
          {...rowMenu(scene.id)}
        />
      </li>
    );
  }

  /** A Chapter's row and its Scenes'; `part` is the Part it is in, if any. */
  function chapterRow(chapter: ManuscriptChapter, part?: ManuscriptPart) {
    /** A Part dropped on a Loose Chapter goes before or after it. */
    const takesPart = !part && !chapter.unplaced;
    return (
      <li
        key={chapter.id}
        className="binder-chapter"
        data-kind="chapter"
        data-id={chapter.id}
        aria-label={chapter.title}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(SCENE)) event.preventDefault();
        }}
        onDrop={(event) => {
          const sceneId = event.dataTransfer.getData(SCENE);
          if (!sceneId) return;
          event.preventDefault();
          event.stopPropagation();
          dropScene(sceneId, chapter);
        }}
      >
        <div
          className="binder-chapter-head"
          onContextMenu={onContextMenu(chapter.id)}
          draggable={renaming !== chapter.id}
          onDragStart={(event) =>
            event.dataTransfer.setData(CHAPTER, chapter.id)
          }
          onDragOver={(event) => {
            const { types } = event.dataTransfer;
            if (
              (types.includes(CHAPTER) && !chapter.unplaced) ||
              (types.includes(PART) && takesPart)
            ) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            const chapterId = event.dataTransfer.getData(CHAPTER);
            const partId = event.dataTransfer.getData(PART);
            if (chapterId) {
              dropChapter(chapterId, chapter, inLowerHalf(event));
            } else if (partId && takesPart) {
              dropPart(partId, chapter.id, inLowerHalf(event), chapter.book);
            } else {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <StatusDot status={statusOf(statuses, chapter.status)} />
          {renaming === chapter.id ? (
            <TitleInput
              title={chapter.title}
              onDone={(title, byKey) => {
                if (title) rename(chapter.id, title, 'chapter');
                else setRenaming(null);
                if (byKey) keys.focusRow(chapter.id);
              }}
            />
          ) : (
            <h2 className="binder-title">
              <button
                data-row={chapter.id}
                aria-current={isSelected('chapter', chapter.id)}
                onClick={() => onSelect({ kind: 'chapter', id: chapter.id })}
                onDoubleClick={() => setRenaming(chapter.id)}
              >
                {chapter.title}
                <ConflictMarker shown={conflicted.has(chapter.id)} />
              </button>
            </h2>
          )}
          <Menu
            label={`Chapter actions: ${chapter.title}`}
            items={chapterMenu(chapter, part)}
            {...rowMenu(chapter.id)}
          />
        </div>
        <ol className="binder-scenes">
          {chapter.scenes.map((scene) => sceneRow(scene, chapter))}
        </ol>
      </li>
    );
  }

  /** A Part's row, collapsible, and its Chapters'. */
  function partRow(part: ManuscriptPart, partChapters: ManuscriptChapter[]) {
    const shut = collapsed.has(part.id);
    return (
      <li
        key={part.id}
        className="binder-part"
        data-kind="part"
        data-id={part.id}
        aria-label={part.title}
        // A Chapter dropped anywhere in a Part, but on another Chapter, goes last in it.
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(CHAPTER))
            event.preventDefault();
        }}
        onDrop={(event) => {
          const chapterId = event.dataTransfer.getData(CHAPTER);
          if (!chapterId) return;
          event.preventDefault();
          event.stopPropagation();
          dropIntoPart(chapterId, part);
        }}
      >
        <div
          className="binder-part-head"
          onContextMenu={onContextMenu(part.id)}
          draggable={renaming !== part.id}
          onDragStart={(event) => event.dataTransfer.setData(PART, part.id)}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PART)) event.preventDefault();
          }}
          onDrop={(event) => {
            const partId = event.dataTransfer.getData(PART);
            if (!partId) return;
            event.preventDefault();
            event.stopPropagation();
            dropPart(partId, part.id, inLowerHalf(event), part.book);
          }}
        >
          <button
            className="binder-collapse"
            aria-expanded={!shut}
            aria-label={`Chapters of ${part.title}`}
            title={shut ? 'Show Chapters' : 'Hide Chapters'}
            onClick={() =>
              shut
                ? expand(part.id)
                : setCollapsed((now) => new Set(now).add(part.id))
            }
          >
            <span aria-hidden="true">{shut ? '▸' : '▾'}</span>
          </button>
          <StatusDot status={statusOf(statuses, part.status)} />
          {renaming === part.id ? (
            <TitleInput
              title={part.title}
              onDone={(title, byKey) => {
                if (title) rename(part.id, title, 'part');
                else setRenaming(null);
                if (byKey) keys.focusRow(part.id);
              }}
            />
          ) : (
            <h2 className="binder-title">
              <button
                data-row={part.id}
                aria-current={isSelected('part', part.id)}
                onClick={() => onSelect({ kind: 'part', id: part.id })}
                onDoubleClick={() => setRenaming(part.id)}
              >
                {part.title}
                <ConflictMarker shown={conflicted.has(part.id)} />
              </button>
            </h2>
          )}
          <Menu
            label={`${name} actions: ${part.title}`}
            items={partMenu(part)}
            {...rowMenu(part.id)}
          />
        </div>
        {!shut &&
          (partChapters.length > 0 ? (
            <ol className="binder-chapters">
              {partChapters.map((chapter) => chapterRow(chapter, part))}
            </ol>
          ) : (
            <p className="binder-part-empty">No Chapters yet</p>
          ))}
      </li>
    );
  }

  /** A Book's row, collapsible, and its Parts' and Loose Chapters'. */
  function bookRow(book: ManuscriptBook) {
    const shut = collapsed.has(book.id);
    const items = topItems(ofBook(book.id));
    const takes = (event: DragEvent<HTMLElement>) => {
      const { types } = event.dataTransfer;
      if (types.includes(CHAPTER) || types.includes(PART)) {
        event.preventDefault();
      }
    };
    return (
      <li
        key={book.id}
        className="binder-book"
        data-kind="book"
        data-id={book.id}
        aria-label={book.title}
        // A Chapter or Part dropped anywhere in a Book, but on another, goes last in it.
        onDragOver={takes}
        onDrop={(event) => dropOnBook(event, book)}
      >
        <div
          className="binder-book-head"
          onContextMenu={onContextMenu(book.id)}
          draggable={renaming !== book.id}
          onDragStart={(event) => event.dataTransfer.setData(BOOK, book.id)}
          onDragOver={(event) => {
            takes(event);
            if (event.dataTransfer.types.includes(BOOK)) event.preventDefault();
          }}
          onDrop={(event) => dropOnBook(event, book)}
        >
          <button
            className="binder-collapse"
            aria-expanded={!shut}
            aria-label={`Contents of ${book.title}`}
            title={shut ? 'Show contents' : 'Hide contents'}
            onClick={() =>
              shut
                ? expand(book.id)
                : setCollapsed((now) => new Set(now).add(book.id))
            }
          >
            <span aria-hidden="true">{shut ? '▸' : '▾'}</span>
          </button>
          <StatusDot status={statusOf(statuses, book.status)} />
          {renaming === book.id ? (
            <TitleInput
              title={book.title}
              onDone={(title, byKey) => {
                if (title) rename(book.id, title, 'book');
                else setRenaming(null);
                if (byKey) keys.focusRow(book.id);
              }}
            />
          ) : (
            <h2 className="binder-title">
              <button
                data-row={book.id}
                aria-current={isSelected('book', book.id)}
                onClick={() => onSelect({ kind: 'book', id: book.id })}
                onDoubleClick={() => setRenaming(book.id)}
              >
                {book.title}
                <ConflictMarker shown={conflicted.has(book.id)} />
              </button>
            </h2>
          )}
          <Menu
            label={`Book actions: ${book.title}`}
            items={bookMenu(book)}
            {...rowMenu(book.id)}
          />
        </div>
        {!shut &&
          (items.length > 0 ? (
            <ol className="binder-chapters">{items.map(topRow)}</ol>
          ) : (
            <p className="binder-part-empty">No Chapters yet</p>
          ))}
      </li>
    );
  }

  function topRow(item: ReturnType<typeof topItems>[number]) {
    return item.kind === 'part'
      ? partRow(item.part, item.chapters)
      : chapterRow(item.chapter);
  }

  const unplaced = unplacedChapters(manuscript);
  return (
    <nav
      className="binder"
      aria-label="Manuscript"
      ref={keys.list}
      onKeyDown={keys.onKeyDown}
    >
      <button
        className="binder-project"
        aria-current={isSelected('project')}
        onClick={() => onSelect({ kind: 'project' })}
      >
        {books ? 'Series Outline' : 'Project Outline'}
        <ConflictMarker shown={conflicted.has(PROJECT_OUTLINE)} />
      </button>
      {books ? (
        <ol className="binder-books">{books.map(bookRow)}</ol>
      ) : (
        <ol className="binder-chapters">{topItems(manuscript).map(topRow)}</ol>
      )}
      <div className="binder-adds">
        <button
          className="binder-add"
          title={withShortcut('New Chapter', SHORTCUTS.newChapter, MAC)}
          onClick={() =>
            create(
              () =>
                project.createChapter(
                  topLength(ofBook(lastBook?.id)),
                  undefined,
                  undefined,
                  lastBook?.id,
                ),
              'Chapter created',
              setRenaming,
            )
          }
        >
          New Chapter
        </button>
        <button
          className="binder-add"
          onClick={() =>
            create(
              () =>
                project.createPart(
                  topLength(ofBook(lastBook?.id)),
                  undefined,
                  lastBook?.id,
                ),
              `${name} created`,
              setRenaming,
            )
          }
        >
          New {name}
        </button>
        {/* A Project of one Book looks as it always has: Insert › New Book makes it a Series. */}
        {books && (
          <button
            className="binder-add"
            onClick={() =>
              create(() => project.createBook(), 'Book created', setRenaming)
            }
          >
            New Book
          </button>
        )}
      </div>
      {unplaced.length > 0 && (
        <section className="binder-unplaced" aria-label="Unplaced Chapters">
          <h2>Unplaced Chapters</h2>
          <ol className="binder-chapters">
            {unplaced.map((chapter) => chapterRow(chapter))}
          </ol>
        </section>
      )}
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

/**
 * A Status's colour, `named` for those who can't see it unless its name is
 * beside it; nothing without one.
 */
export function StatusDot({
  status,
  named = true,
}: {
  status: Status | undefined;
  named?: boolean;
}) {
  if (!status) return null;
  return named ? (
    <span
      className="status-dot"
      data-colour={status.colour}
      role="img"
      aria-label={`Status: ${status.name}`}
      title={status.name}
    />
  ) : (
    <span className="status-dot" data-colour={status.colour} aria-hidden />
  );
}

/**
 * The choices of a unit's Status: none, or one of the list, the one it has
 * checked. `onChoose` gets the chosen Status's id, or null for none.
 */
export function statusChoices(
  statuses: readonly Status[],
  statusId: string | undefined,
  onChoose: (statusId: string | null) => void,
): MenuItem[] {
  const current = statusOf(statuses, statusId);
  return [
    { label: 'No Status', checked: !current, run: () => onChoose(null) },
    ...statuses.map((status) => ({
      label: status.name,
      before: <StatusDot status={status} named={false} />,
      checked: current?.id === status.id,
      run: () => onChoose(status.id),
    })),
  ];
}

/** Marks a unit in Conflict; it stays editable. */
export function ConflictMarker({ shown }: { shown: boolean }) {
  return shown ? <span className="binder-conflict"> Conflict</span> : null;
}

/** Whether a drag is over the lower half of the row it is over. */
export function inLowerHalf(event: DragEvent<HTMLElement>): boolean {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
}

/**
 * Edits a title in place: Enter or leaving the field keeps it, Escape
 * cancels. `byKey` is set when Enter or Escape ended it.
 */
export function TitleInput({
  title,
  onDone,
}: {
  title: string;
  onDone(title: string | null, byKey: boolean): void;
}) {
  const [value, setValue] = useState(title);
  const done = useRef(false);
  function finish(result: string | null, byKey = false) {
    if (done.current) return;
    done.current = true;
    onDone(result === title ? null : result, byKey);
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
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        // Focus goes back to the row, which this Enter must not then open.
        event.preventDefault();
        finish(event.key === 'Enter' ? value.trim() || null : null, true);
      }}
      onBlur={() => finish(value.trim() || null)}
    />
  );
}

export type MenuItem = {
  label: string;
  disabled?: boolean;
  /** The keys that do the same for the row with focus, as an accelerator. */
  shortcut?: string;
  /** Shown before the label, such as a Status's dot. */
  before?: ReactNode;
} & (
  | {
      run(): unknown;
      /** Set for one of a set of choices: whether it is the one chosen. */
      checked?: boolean;
    }
  /** A submenu, which →, Enter or a click opens and ← or Escape closes. */
  | { items: MenuItem[] }
);

/** Add Todo…, in the menu of a Scene, Chapter, Part or Entry, linked to it. */
export function addTodoItem(readOnly: boolean, run: () => void): MenuItem {
  return { label: 'Add Todo…', disabled: readOnly, run };
}

/** Keys as `aria-keyshortcuts` names them, such as Control+Shift+Enter or Alt+ArrowUp. */
function ariaKeys(text: string): string {
  return text
    .replace('Ctrl', 'Control')
    .replace('⌘', 'Meta')
    .replace('Option', 'Alt')
    .replace('↑', 'ArrowUp')
    .replace('↓', 'ArrowDown')
    .replace('←', 'ArrowLeft')
    .replace('→', 'ArrowRight');
}

/**
 * A button that opens `items`; it shows `children`, or ⋯ when there are none.
 * Open, the first item has focus; ↑/↓, Home and End choose, Enter does it,
 * and Escape closes it, returning focus to `returnFocus` or the button.
 * `open` and `onOpenChange` let a list open it from its row, as Shift+F10 does.
 */
export function Menu({
  label,
  items,
  children,
  title,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  returnFocus,
}: {
  label: string;
  items: MenuItem[];
  children?: ReactNode;
  /** The button's tooltip, such as its shortcut. */
  title?: string;
  /** Whether the button can't open it, as once the Project is read-only. */
  disabled?: boolean;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  returnFocus?(): void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const latestSetOpen = useRef(setOpen);
  useEffect(() => {
    latestSetOpen.current = setOpen;
  });

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>(`${ITEM}:not(:disabled)`)?.focus();
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        latestSetOpen.current(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function closeToRow() {
    setOpen(false);
    if (returnFocus) returnFocus();
    else button.current?.focus();
  }

  return (
    <div className="menu" ref={root}>
      <button
        ref={button}
        className="menu-button"
        aria-label={label}
        title={title}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {children ?? '⋯'}
      </button>
      {open && (
        <MenuList
          label={label}
          items={items}
          done={closeToRow}
          // Focus leaving it, as by Tab or F6, closes it behind.
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget)) setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** A menu's items, of any role: plain, one of a set of choices, or a submenu. */
const ITEM = '[role^="menuitem"]';

/**
 * The items of a menu or submenu. ↑/↓, Home and End choose among its own,
 * Enter does one, and `done` closes the whole menu once one is done, or on
 * Escape. A submenu's `back`, on ← or Escape, closes just it.
 */
function MenuList({
  label,
  items,
  done,
  back,
  onBlur,
}: {
  label: string;
  items: MenuItem[];
  done(): void;
  back?(): void;
  onBlur?(event: FocusEvent<HTMLDivElement>): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  /** The item whose submenu is open, if any. */
  const [open, setOpen] = useState<string | null>(null);
  /** Its own items, not those of a submenu. */
  const own = () => [
    ...(list.current?.querySelectorAll<HTMLElement>(
      `:scope > ${ITEM}, :scope > .menu-parent > ${ITEM}`,
    ) ?? []),
  ];

  const isSubmenu = back !== undefined;
  useEffect(() => {
    if (!isSubmenu) return;
    // A submenu opens on its choice, if it has one.
    const enabled = own().filter((item) => !item.matches(':disabled'));
    (
      enabled.find((item) => item.getAttribute('aria-checked') === 'true') ??
      enabled[0]
    )?.focus();
  }, [isSubmenu]);

  function closeSubmenu(itemLabel: string) {
    setOpen(null);
    own()
      .find((item) => item.dataset.label === itemLabel)
      ?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = own().filter((item) => !item.matches(':disabled'));
    const active = document.activeElement as HTMLElement;
    const at = enabled.indexOf(active);
    const last = enabled.length - 1;
    const key = event.key;
    if (key === 'Escape') (back ?? done)();
    else if (key === 'ArrowLeft' && back) back();
    else if (key === 'ArrowRight' && active.getAttribute('aria-haspopup')) {
      setOpen(active.dataset.label ?? null);
    } else if (key === 'ArrowDown') enabled[at >= last ? 0 : at + 1]?.focus();
    else if (key === 'ArrowUp') enabled[at <= 0 ? last : at - 1]?.focus();
    else if (key === 'Home') enabled[0]?.focus();
    else if (key === 'End') enabled[last]?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      ref={list}
      role="menu"
      aria-label={label}
      className={back ? 'menu-items menu-submenu' : 'menu-items'}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {items.map((item) => {
        const content = (
          <>
            {item.before}
            {item.label}
            {item.shortcut && (
              // Shown, not part of the item's name.
              <span className="menu-shortcut" aria-hidden="true">
                {shortcutText(item.shortcut, MAC)}
              </span>
            )}
          </>
        );
        if ('items' in item) {
          return (
            <div key={item.label} className="menu-parent">
              <button
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                data-label={item.label}
                aria-haspopup="menu"
                aria-expanded={open === item.label}
                onClick={() => setOpen(open === item.label ? null : item.label)}
              >
                {content}
                <span className="menu-arrow" aria-hidden="true">
                  ▸
                </span>
              </button>
              {open === item.label && (
                <MenuList
                  label={item.label}
                  items={item.items}
                  done={done}
                  back={() => closeSubmenu(item.label)}
                />
              )}
            </div>
          );
        }
        const choice = item.checked !== undefined;
        return (
          <button
            key={item.label}
            role={choice ? 'menuitemradio' : 'menuitem'}
            aria-checked={choice ? item.checked : undefined}
            tabIndex={-1}
            disabled={item.disabled}
            data-label={item.label}
            aria-keyshortcuts={
              item.shortcut && ariaKeys(shortcutText(item.shortcut, MAC))
            }
            onClick={() => {
              done();
              void item.run();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
