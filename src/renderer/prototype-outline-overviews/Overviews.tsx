// PROTOTYPE (throwaway): the three overview layouts for "Outline overviews in
// Writing" (#67). See OverviewSwitcher.tsx. Every field is the real Outline
// or Notes editor (OutlineNotes), so edits autosave.

import { useEffect, useState, type ReactNode } from 'react';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type ProseLanguage,
} from '../../shared/project-types';
import { OutlineNotes } from '../OutlineNotes';

export type OverviewScope =
  | { kind: 'chapter'; id: string }
  | { kind: 'project' };

type Props = {
  manuscript: Manuscript;
  language: ProseLanguage;
  scope: OverviewScope;
  onOpenScene(id: string): void;
  onOpenChapter(id: string): void;
};

/** Reads the Outlines of `ids`, again whenever `refresh` changes. */
function useOutlines(ids: string[], refresh: number) {
  const [outlines, setOutlines] = useState<Map<string, string>>(new Map());
  const key = ids.join(',');
  useEffect(() => {
    let current = true;
    void Promise.all(
      key.split(',').map((id) =>
        window.project
          .read({ kind: 'outline', id })
          .then(({ body }) => [id, body] as const)
          .catch(() => [id, ''] as const),
      ),
    ).then((read) => {
      if (current) setOutlines(new Map(read));
    });
    return () => {
      current = false;
    };
  }, [key, refresh]);
  return outlines;
}

function firstLine(body: string | undefined) {
  const line = body
    ?.split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .find(Boolean);
  return line ?? '';
}

function chapterOf(manuscript: Manuscript, id: string) {
  return manuscript.chapters.find((c) => c.id === id);
}

function useToggleSet(initial: string[] = []) {
  const [set, setSet] = useState(() => new Set(initial));
  const toggle = (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };
  return [set, toggle, (ids: string[]) => setSet(new Set(ids))] as const;
}

function scenesLabel(n: number) {
  return n === 1 ? '1 Scene' : `${n} Scenes`;
}

/* ------------------------------------------------------------------ *
 * A. Document: one long page, everything open and editable in place.
 * ------------------------------------------------------------------ */

export function DocumentOverview({
  manuscript,
  language,
  scope,
  onOpenScene,
  onOpenChapter,
}: Props) {
  const [expanded, toggle, setExpanded] = useToggleSet();

  const sceneBlock = (scene: ManuscriptScene) => (
    <section key={scene.id} className="ov-doc-unit ov-doc-scene">
      <button className="ov-link" onClick={() => onOpenScene(scene.id)}>
        {scene.title}
      </button>
      <OutlineNotes unitId={scene.id} language={language} withNotes />
    </section>
  );

  if (scope.kind === 'chapter') {
    const chapter = chapterOf(manuscript, scope.id);
    if (!chapter) return null;
    return (
      <div className="ov-root ov-doc">
        <h2 className="centre-title">{chapter.title}</h2>
        <div className="ov-doc-own">
          <OutlineNotes unitId={chapter.id} language={language} withNotes />
        </div>
        <h3 className="ov-section-heading">
          Scenes <span className="ov-count">{chapter.scenes.length}</span>
        </h3>
        {chapter.scenes.length === 0 && (
          <p className="ov-empty">No Scenes yet.</p>
        )}
        {chapter.scenes.map(sceneBlock)}
      </div>
    );
  }

  const chapterIds = manuscript.chapters.map((c) => c.id);
  return (
    <div className="ov-root ov-doc">
      <h2 className="centre-title">Project Outline</h2>
      <div className="ov-doc-own">
        <OutlineNotes
          unitId={PROJECT_OUTLINE}
          language={language}
          withNotes={false}
        />
      </div>
      <h3 className="ov-section-heading">
        Chapters <span className="ov-count">{manuscript.chapters.length}</span>
        <span className="ov-heading-actions">
          <button onClick={() => setExpanded(chapterIds)}>Expand all</button>
          <button onClick={() => setExpanded([])}>Collapse all</button>
        </span>
      </h3>
      {manuscript.chapters.map((chapter) => (
        <section key={chapter.id} className="ov-doc-unit">
          <div className="ov-unit-head">
            <button
              className="ov-link"
              onClick={() => onOpenChapter(chapter.id)}
            >
              {chapter.title}
            </button>
            <button
              className="ov-disclose"
              aria-expanded={expanded.has(chapter.id)}
              onClick={() => toggle(chapter.id)}
            >
              {expanded.has(chapter.id) ? '▾' : '▸'}{' '}
              {scenesLabel(chapter.scenes.length)}
            </button>
          </div>
          <OutlineNotes unitId={chapter.id} language={language} withNotes />
          {expanded.has(chapter.id) && (
            <div className="ov-doc-nested">
              {chapter.scenes.map(sceneBlock)}
            </div>
          )}
        </section>
      ))}
      {manuscript.unplaced.length > 0 && (
        <section className="ov-doc-unit">
          <div className="ov-unit-head">
            <span className="ov-unit-title">Unplaced</span>
            <button
              className="ov-disclose"
              aria-expanded={expanded.has('unplaced')}
              onClick={() => toggle('unplaced')}
            >
              {expanded.has('unplaced') ? '▾' : '▸'}{' '}
              {scenesLabel(manuscript.unplaced.length)}
            </button>
          </div>
          {expanded.has('unplaced') && (
            <div className="ov-doc-nested">
              {manuscript.unplaced.map(sceneBlock)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * B. Accordion: every unit a one-line row with its Outline's first line;
 * open a row to edit its Outline and Notes. Shown in the centre, or as a
 * column beside the Prose while writing.
 * ------------------------------------------------------------------ */

export function AccordionOverview({
  manuscript,
  language,
  scope,
  onOpenScene,
  onOpenChapter,
  compact = false,
  writingSceneId = null,
}: Props & { compact?: boolean; writingSceneId?: string | null }) {
  const [open, toggleOpen] = useToggleSet(
    !compact && scope.kind === 'chapter' ? [scope.id] : [PROJECT_OUTLINE],
  );
  const [reads, setReads] = useState(0);
  const chapter = scope.kind === 'chapter' && chapterOf(manuscript, scope.id);
  const ids =
    scope.kind === 'chapter'
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
  const outlines = useOutlines(ids, reads);

  const toggle = (id: string) => {
    // A row closing shows its Outline's first line as it is now.
    if (open.has(id)) setReads(reads + 1);
    toggleOpen(id);
  };

  const row = (
    id: string,
    title: string,
    kind: 'project' | 'chapter' | 'scene',
    children?: ReactNode,
  ) => {
    const writing = id === writingSceneId;
    const isOpen = open.has(id) && !writing;
    const preview = firstLine(outlines.get(id));
    return (
      <div
        key={id}
        className={`ov-acc-row ov-acc-${kind}`}
        data-open={isOpen}
        data-writing={writing}
      >
        <div className="ov-acc-head">
          <button
            className="ov-acc-toggle"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Close' : 'Open'} ${title}`}
            disabled={writing}
            onClick={() => toggle(id)}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          {kind === 'scene' ? (
            <button className="ov-link" onClick={() => onOpenScene(id)}>
              {title}
            </button>
          ) : kind === 'chapter' && !compact ? (
            <button className="ov-link" onClick={() => onOpenChapter(id)}>
              {title}
            </button>
          ) : (
            <span className="ov-unit-title" onClick={() => toggle(id)}>
              {title}
            </span>
          )}
          {writing ? (
            <span className="ov-badge">
              Writing · Outline & Notes above the Prose
            </span>
          ) : (
            !isOpen && (
              <span
                className={`ov-acc-preview${preview ? '' : ' ov-empty'}`}
                onClick={() => toggle(id)}
              >
                {preview || 'No Outline'}
              </span>
            )
          )}
        </div>
        {isOpen && (
          <div className="ov-acc-body">
            <OutlineNotes
              unitId={id}
              language={language}
              withNotes={kind !== 'project'}
            />
          </div>
        )}
        {children}
      </div>
    );
  };

  const sceneRows = (scenes: ManuscriptScene[]) => (
    <div className="ov-acc-children">
      {scenes.map((s) => row(s.id, s.title, 'scene'))}
    </div>
  );

  if (scope.kind === 'chapter') {
    if (!chapter) return null;
    return (
      <div className={`ov-root ov-acc${compact ? ' ov-compact' : ''}`}>
        {!compact && <h2 className="centre-title">{chapter.title}</h2>}
        {row(chapter.id, compact ? chapter.title : 'This Chapter', 'chapter')}
        {chapter.scenes.length === 0 && (
          <p className="ov-empty">No Scenes yet.</p>
        )}
        {sceneRows(chapter.scenes)}
      </div>
    );
  }

  const chapterRow = (c: ManuscriptChapter) =>
    row(
      c.id,
      c.title,
      'chapter',
      // Scenes show under a Chapter only once it is open.
      open.has(c.id) && sceneRows(c.scenes),
    );
  return (
    <div className={`ov-root ov-acc${compact ? ' ov-compact' : ''}`}>
      {!compact && <h2 className="centre-title">Project Outline</h2>}
      {row(PROJECT_OUTLINE, 'The story', 'project')}
      {manuscript.chapters.map(chapterRow)}
      {manuscript.unplaced.length > 0 && (
        <div className="ov-acc-row ov-acc-chapter">
          <div className="ov-acc-head">
            <span className="ov-unit-title">Unplaced</span>
          </div>
          {sceneRows(manuscript.unplaced)}
        </div>
      )}
    </div>
  );
}

/** Variant B's column beside the Prose, with its own Chapter / Project scope. */
export function OverviewBeside({
  manuscript,
  language,
  writingSceneId,
  chapterId,
  onOpenScene,
  onOpenChapter,
  onClose,
}: Omit<Props, 'scope'> & {
  writingSceneId: string;
  chapterId: string | null;
  onClose(): void;
}) {
  const [scope, setScope] = useState<'chapter' | 'project'>(
    chapterId ? 'chapter' : 'project',
  );
  const shown: OverviewScope =
    scope === 'chapter' && chapterId
      ? { kind: 'chapter', id: chapterId }
      : { kind: 'project' };
  return (
    <aside className="ov-beside" aria-label="Overview">
      <div className="ov-beside-head">
        <div
          role="group"
          aria-label="Overview of"
          className="mode-switch ov-scope"
        >
          <button
            aria-pressed={shown.kind === 'chapter'}
            disabled={!chapterId}
            onClick={() => setScope('chapter')}
          >
            Chapter
          </button>
          <button
            aria-pressed={shown.kind === 'project'}
            onClick={() => setScope('project')}
          >
            Project
          </button>
        </div>
        <button
          className="ov-close"
          aria-label="Close overview"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <AccordionOverview
        // A new scope starts with its rows closed.
        key={shown.kind === 'chapter' ? shown.id : 'project'}
        manuscript={manuscript}
        language={language}
        scope={shown}
        onOpenScene={onOpenScene}
        onOpenChapter={onOpenChapter}
        compact
        writingSceneId={writingSceneId}
      />
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * C. Corkboard: each unit an index card with its Outline and Notes; a
 * Chapter's Scenes are a grid of cards, the Project's Chapters are lanes.
 * ------------------------------------------------------------------ */

function Card({
  id,
  title,
  number,
  language,
  onOpen,
  tint,
}: {
  id: string;
  title: string;
  number?: number;
  language: ProseLanguage;
  onOpen(): void;
  tint?: boolean;
}) {
  return (
    <article className={`ov-card${tint ? ' ov-card-tint' : ''}`}>
      <header>
        {number !== undefined && <span className="ov-card-num">{number}</span>}
        <button className="ov-link" onClick={onOpen}>
          {title}
        </button>
      </header>
      <OutlineNotes unitId={id} language={language} withNotes />
    </article>
  );
}

export function BoardOverview({
  manuscript,
  language,
  scope,
  onOpenScene,
  onOpenChapter,
}: Props) {
  const [expanded, toggle, setExpanded] = useToggleSet();

  if (scope.kind === 'chapter') {
    const chapter = chapterOf(manuscript, scope.id);
    if (!chapter) return null;
    return (
      <div className="ov-root ov-board">
        <h2 className="centre-title">{chapter.title}</h2>
        <div className="ov-card ov-card-wide ov-card-tint">
          <OutlineNotes unitId={chapter.id} language={language} withNotes />
        </div>
        <div className="ov-grid">
          {chapter.scenes.map((scene, i) => (
            <Card
              key={scene.id}
              id={scene.id}
              title={scene.title}
              number={i + 1}
              language={language}
              onOpen={() => onOpenScene(scene.id)}
            />
          ))}
          {chapter.scenes.length === 0 && (
            <p className="ov-empty">No Scenes yet.</p>
          )}
        </div>
      </div>
    );
  }

  const chapterIds = manuscript.chapters.map((c) => c.id);
  return (
    <div className="ov-root ov-board">
      <h2 className="centre-title">Project Outline</h2>
      <div className="ov-card ov-card-wide ov-card-tint">
        <OutlineNotes
          unitId={PROJECT_OUTLINE}
          language={language}
          withNotes={false}
        />
      </div>
      <h3 className="ov-section-heading">
        Chapters <span className="ov-count">{manuscript.chapters.length}</span>
        <span className="ov-heading-actions">
          <button onClick={() => setExpanded(chapterIds)}>
            Show all Scenes
          </button>
          <button onClick={() => setExpanded([])}>Hide all Scenes</button>
        </span>
      </h3>
      {manuscript.chapters.map((chapter, i) => (
        <section key={chapter.id} className="ov-lane">
          <div className="ov-lane-cards">
            <Card
              id={chapter.id}
              title={chapter.title}
              number={i + 1}
              language={language}
              onOpen={() => onOpenChapter(chapter.id)}
              tint
            />
            <button
              className="ov-lane-toggle"
              aria-expanded={expanded.has(chapter.id)}
              onClick={() => toggle(chapter.id)}
            >
              {expanded.has(chapter.id) ? '◂' : '▸'}
              <span>{scenesLabel(chapter.scenes.length)}</span>
            </button>
            {expanded.has(chapter.id) &&
              chapter.scenes.map((scene, j) => (
                <Card
                  key={scene.id}
                  id={scene.id}
                  title={scene.title}
                  number={j + 1}
                  language={language}
                  onOpen={() => onOpenScene(scene.id)}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
