import { useEffect, useState, type ReactNode } from 'react';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type OutlineValue,
  type ProseLanguage,
} from '../shared/project-types';
import { OutlineNotes } from './OutlineNotes';
import { StatusAndTagsEditor, UnitStatusDot } from './StatusAndTags';
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
  onOpenProject(): void;
};

/**
 * The column between the Binder and the Prose: a row per unit of the Chapter
 * being written, or of the whole Project, each its Status dot, title and its
 * Outline's first line, opening to edit its Status, Tags, Outline and Notes
 * in place. The Scene being written is marked, and doesn't open: its
 * Outline & Notes are above the Prose, and one unit's field is open in only
 * one place.
 */
export function OverviewPane({
  manuscript,
  language,
  writing,
  width,
  onClose,
  ...navigation
}: Navigation & {
  manuscript: Manuscript;
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
                  Project
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
  language,
  writing,
  scope,
  header,
  onOpenScene,
  onOpenChapter,
  onOpenProject,
}: Navigation & {
  manuscript: Manuscript;
  language: ProseLanguage;
  writing: Writing;
  scope: OverviewScope;
  header(actions: ReactNode): ReactNode;
}) {
  /** The rows whose Outline and Notes are open. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  /** In Project scope, the Chapters, or the Unplaced Scenes, listing their Scenes. */
  const [listed, setListed] = useState(() => startListed(scope, writing));
  /** Counts rows closing: each shows its Outline's first line as it is now. */
  const [refreshes, setRefreshes] = useState(0);
  const without = (set: ReadonlySet<string>, id: string) =>
    new Set([...set].filter((other) => other !== id));
  /**
   * Opens or closes a row. A Chapter in Project scope opens to its Outline
   * and Notes and its Scenes, and closes from either.
   */
  const toggle = (id: string, { lists = false, fields = true } = {}) => {
    const expanded = (fields && open.has(id)) || (lists && listed.has(id));
    if (expanded) {
      if (open.has(id)) setRefreshes(refreshes + 1);
      setOpen(without(open, id));
      setListed(without(listed, id));
    } else {
      if (fields) setOpen(new Set(open).add(id));
      if (lists) setListed(new Set(listed).add(id));
    }
  };
  const expandableIds = expandable(manuscript, scope, writing);
  const listable =
    scope === 'project'
      ? expandableIds.filter(
          (id) =>
            id === UNPLACED || manuscript.chapters.some((c) => c.id === id),
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
          ...manuscript.chapters.flatMap((c) => [
            c.id,
            ...c.scenes.map((s) => s.id),
          ]),
          ...manuscript.unplaced.map((s) => s.id),
        ];
  // The Scene left last is read anew too: its Outline was edited above the Prose.
  const outlines = useOutlines(outlineIds, `${refreshes}:${writing.sceneId}`);

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
    kind: 'project' | 'chapter' | 'scene';
    /** A Chapter or Scene, with its Status and Tags; none for the Project. */
    unit?: ManuscriptChapter | ManuscriptScene;
    missing?: boolean;
    /** Whether the row lists Scenes under it while expanded. */
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
        </div>
        {isOpen && (
          <div className="overview-row-body">
            {unit && <StatusAndTagsEditor unit={unit} />}
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
          setRefreshes(refreshes + 1);
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
              title: 'Project Outline',
              kind: 'project',
            })}
            {manuscript.chapters.map((c) =>
              row({
                id: c.id,
                title: c.title,
                kind: 'chapter',
                unit: c,
                lists: true,
                children:
                  (open.has(c.id) || listed.has(c.id)) && sceneRows(c.scenes),
              }),
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

/**
 * The Outlines of `ids`, read again whenever `refresh` changes, and as
 * another computer or a Proposal changes one.
 */
function useOutlines(ids: string[], refresh: string) {
  const [outlines, setOutlines] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const key = ids.join(',');
  useEffect(() => {
    let current = true;
    void Promise.all(
      key
        .split(',')
        .filter(Boolean)
        .map((id) =>
          window.project
            .read({ kind: 'outline', id })
            .then(({ body }) => [id, body] as const)
            .catch(() => [id, ''] as const),
        ),
    ).then((read) => {
      if (current) setOutlines(new Map(read));
    });
    const unsubscribe = window.project.subscribe((event) => {
      if (event.type !== 'unitReloaded' || event.ref.kind !== 'outline') return;
      const { id } = event.ref;
      const { body } = event.value as OutlineValue;
      setOutlines((outlines) => new Map(outlines).set(id, body));
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [key, refresh]);
  return outlines;
}
