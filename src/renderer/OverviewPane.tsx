import { useState, type ReactNode } from 'react';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptBook,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import { OutlineNotes } from './OutlineNotes';
import { useOutlines } from './use-project';
import { StatusAndTagsEditor, UnitStatusDot } from './StatusAndTags';
import { UnitImageButtons, UnitThumbnail } from './UnitImage';
import { topItems, unplacedChapters } from '../shared/manuscript-order';
import {
  defaultScope,
  expandable,
  firstLine,
  startListed,
  UNPLACED,
  type OverviewScope,
  type Writing,
} from './overview';

type Navigation = {
  onOpenScene(id: string): void;
  onOpenChapter(id: string): void;
  onOpenPart(id: string): void;
  onOpenBook(id: string): void;
  onOpenProject(): void;
};

/**
 * The column between the Binder and the Prose: a row per unit of the Chapter
 * being written, or of the whole Project, each its Status dot, title and its
 * Outline's first line, and its image, opening to edit its Status, Tags,
 * image, Outline and Notes in place. A Part's row holds its Chapters' rows.
 * In a Series, `manuscript` is the `book` being written alone, under the
 * Series Outline and its own. The Scene being written is marked, and
 * doesn't open: its Outline & Notes are above the Prose, and one unit's
 * field is open in only one place.
 */
export function OverviewPane({
  manuscript,
  book,
  language,
  writing,
  width,
  onClose,
  ...navigation
}: Navigation & {
  manuscript: Manuscript;
  book?: ManuscriptBook;
  language: ProseLanguage;
  writing: Writing;
  width: number;
  onClose(): void;
}) {
  /** The scope the Author chose, if any; the default otherwise. */
  const [chosen, setChosen] = useState<OverviewScope | null>(null);
  const scope =
    (chosen ?? defaultScope(writing)) === 'chapter' && writing.chapterId
      ? 'chapter'
      : 'project';
  return (
    <aside className="overview-pane" aria-label="Overview" style={{ width }}>
      <Rows
        // A scope, or another Chapter being written, starts as it would anew.
        key={`${scope}:${writing.chapterId ?? UNPLACED}`}
        manuscript={manuscript}
        book={book}
        language={language}
        writing={writing}
        scope={scope}
        header={(actions) => (
          <div className="overview-head">
            <div className="overview-scope">
              <div
                role="group"
                aria-label="Overview of"
                className="mode-switch"
              >
                <button
                  aria-pressed={scope === 'chapter'}
                  disabled={!writing.chapterId}
                  onClick={() => setChosen('chapter')}
                >
                  Chapter
                </button>
                <button
                  aria-pressed={scope === 'project'}
                  onClick={() => setChosen('project')}
                >
                  {book ? 'Book' : 'Project'}
                </button>
              </div>
              <button
                className="overview-close"
                aria-label="Close Overview"
                title="Close Overview"
                onClick={onClose}
              >
                ×
              </button>
            </div>
            <div className="overview-actions">{actions}</div>
          </div>
        )}
        {...navigation}
      />
    </aside>
  );
}

/** The pane's header, given its Expand all and Collapse all, then its rows. */
function Rows({
  manuscript,
  book,
  language,
  writing,
  scope,
  header,
  onOpenScene,
  onOpenChapter,
  onOpenPart,
  onOpenBook,
  onOpenProject,
}: Navigation & {
  manuscript: Manuscript;
  book?: ManuscriptBook;
  language: ProseLanguage;
  writing: Writing;
  scope: OverviewScope;
  header(actions: ReactNode): ReactNode;
}) {
  /** The rows whose Outline and Notes are open. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * In Project scope, the Parts listing their Chapters, and the Chapters, or
   * the Unplaced Scenes, listing their Scenes.
   */
  const [listed, setListed] = useState(() =>
    startListed(scope, writing, manuscript),
  );
  const without = (set: ReadonlySet<string>, id: string) =>
    new Set([...set].filter((other) => other !== id));
  /**
   * Opens or closes a row. A Chapter in Project scope opens to its Outline
   * and Notes and its Scenes, a Part to its own and its Chapters, and
   * closes from either.
   */
  const toggle = (id: string, { lists = false, fields = true } = {}) => {
    const expanded = (fields && open.has(id)) || (lists && listed.has(id));
    if (expanded) {
      setOpen(without(open, id));
      setListed(without(listed, id));
    } else {
      if (fields) setOpen(new Set(open).add(id));
      if (lists) setListed(new Set(listed).add(id));
    }
  };
  const expandableIds = expandable(manuscript, scope, writing, book?.id);
  const listable =
    scope === 'project'
      ? expandableIds.filter(
          (id) =>
            id === UNPLACED ||
            manuscript.chapters.some((c) => c.id === id) ||
            !!manuscript.parts?.some((p) => p.id === id),
        )
      : [];
  const withFields = expandableIds.filter((id) => id !== UNPLACED);
  const chapter = manuscript.chapters.find((c) => c.id === writing.chapterId);
  const outlineIds =
    scope === 'chapter'
      ? chapter
        ? [chapter.id, ...chapter.scenes.map((s) => s.id)]
        : []
      : [
          PROJECT_OUTLINE,
          ...(book ? [book.id] : []),
          ...(manuscript.parts ?? []).map((p) => p.id),
          ...manuscript.chapters.flatMap((c) => [
            c.id,
            ...c.scenes.map((s) => s.id),
          ]),
          ...manuscript.unplaced.map((s) => s.id),
        ];
  const { outlines } = useOutlines(outlineIds);

  const row = ({
    id,
    title,
    kind,
    unit,
    missing = false,
    lists = false,
    children,
  }: {
    id: string;
    title: string;
    kind: 'project' | 'book' | 'part' | 'chapter' | 'scene';
    /** A Book, Part, Chapter or Scene, with its Status and Tags; none for the Project. */
    unit?:
      | ManuscriptBook
      | ManuscriptPart
      | ManuscriptChapter
      | ManuscriptScene;
    missing?: boolean;
    /** Whether the row lists Scenes, or a Part's Chapters, under it while expanded. */
    lists?: boolean;
    children?: ReactNode;
  }) => {
    const isWriting = id === writing.sceneId;
    const isOpen = open.has(id) && !isWriting && !missing;
    const expanded = isOpen || (lists && listed.has(id));
    const preview = firstLine(outlines.get(id) ?? '');
    const navigate =
      kind === 'scene'
        ? () => onOpenScene(id)
        : kind === 'chapter'
          ? () => onOpenChapter(id)
          : kind === 'part'
            ? () => onOpenPart(id)
            : kind === 'book'
              ? () => onOpenBook(id)
              : onOpenProject;
    return (
      <section
        key={id}
        className={`overview-row ${kind}`}
        aria-label={title}
        data-writing={isWriting || undefined}
      >
        <div className="overview-row-head">
          <button
            className="overview-toggle"
            aria-expanded={expanded}
            aria-label={`Outline & Notes of ${title}`}
            disabled={isWriting || missing}
            onClick={() => toggle(id, { lists })}
          >
            <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </button>
          {unit && <UnitStatusDot unit={unit} />}
          <button
            className="overview-title"
            aria-label={`Open ${title}`}
            onClick={navigate}
          >
            {title}
          </button>
          {isWriting ? (
            <span className="overview-writing">Writing</span>
          ) : missing ? (
            <span className="overview-preview empty">
              Missing, possibly not synced yet.
            </span>
          ) : (
            !isOpen && (
              <span className={`overview-preview${preview ? '' : ' empty'}`}>
                {preview || 'No Outline'}
              </span>
            )
          )}
          {unit && <UnitThumbnail unit={unit} />}
        </div>
        {isOpen && (
          <div className="overview-row-body">
            {unit && <StatusAndTagsEditor unit={unit} />}
            {unit && <UnitImageButtons unit={unit} />}
            <OutlineNotes
              unitId={id}
              language={language}
              withNotes={kind !== 'project'}
            />
          </div>
        )}
        {children}
      </section>
    );
  };

  const sceneRows = (scenes: ManuscriptScene[]) =>
    scenes.length === 0 ? (
      <p className="overview-empty">No Scenes yet.</p>
    ) : (
      <div className="overview-children">
        {scenes.map((scene) =>
          row({
            id: scene.id,
            title: scene.title,
            kind: 'scene',
            unit: scene,
            missing: scene.missing,
          }),
        )}
      </div>
    );

  const chapterRow = (c: ManuscriptChapter) =>
    row({
      id: c.id,
      title: c.title,
      kind: 'chapter',
      unit: c,
      lists: true,
      children: (open.has(c.id) || listed.has(c.id)) && sceneRows(c.scenes),
    });

  const chapterRows = (chapters: ManuscriptChapter[]) =>
    chapters.length === 0 ? (
      <p className="overview-empty">No Chapters yet.</p>
    ) : (
      <div className="overview-children">{chapters.map(chapterRow)}</div>
    );

  const unplaced = unplacedChapters(manuscript);

  const actions = (
    <>
      <button
        disabled={
          withFields.every((id) => open.has(id)) &&
          listable.every((id) => listed.has(id))
        }
        onClick={() => {
          setOpen(new Set(withFields));
          setListed(new Set(listable));
        }}
      >
        Expand all
      </button>
      <button
        disabled={
          withFields.every((id) => !open.has(id)) &&
          listable.every((id) => !listed.has(id))
        }
        onClick={() => {
          setOpen(new Set());
          setListed(new Set());
        }}
      >
        Collapse all
      </button>
    </>
  );

  return (
    <>
      {header(actions)}
      <div className="overview-rows">
        {scope === 'chapter' ? (
          chapter && (
            <>
              {row({
                id: chapter.id,
                title: chapter.title,
                kind: 'chapter',
                unit: chapter,
              })}
              {sceneRows(chapter.scenes)}
            </>
          )
        ) : (
          <>
            {row({
              id: PROJECT_OUTLINE,
              title: book ? 'Series Outline' : 'Project Outline',
              kind: 'project',
            })}
            {book &&
              row({ id: book.id, title: book.title, kind: 'book', unit: book })}

            {topItems(manuscript).map((item) =>
              item.kind === 'chapter'
                ? chapterRow(item.chapter)
                : row({
                    id: item.part.id,
                    title: item.part.title,
                    kind: 'part',
                    unit: item.part,
                    lists: true,
                    children:
                      (open.has(item.part.id) || listed.has(item.part.id)) &&
                      chapterRows(item.chapters),
                  }),
            )}
            {unplaced.length > 0 && (
              <section
                className="overview-row group"
                aria-label="Unplaced Chapters"
              >
                <div className="overview-row-head">
                  <span className="overview-title">Unplaced Chapters</span>
                </div>
                <div className="overview-children">
                  {unplaced.map(chapterRow)}
                </div>
              </section>
            )}
            {manuscript.unplaced.length > 0 && (
              <section
                className="overview-row group"
                aria-label="Unplaced Scenes"
              >
                <div className="overview-row-head">
                  <button
                    className="overview-toggle"
                    aria-expanded={listed.has(UNPLACED)}
                    aria-label="Scenes of Unplaced Scenes"
                    onClick={() =>
                      toggle(UNPLACED, { lists: true, fields: false })
                    }
                  >
                    <span aria-hidden="true">
                      {listed.has(UNPLACED) ? '▾' : '▸'}
                    </span>
                  </button>
                  <span className="overview-title">Unplaced Scenes</span>
                </div>
                {listed.has(UNPLACED) && sceneRows(manuscript.unplaced)}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
