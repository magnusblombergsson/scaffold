import { useContext, useState, type ReactNode } from 'react';
import {
  partName,
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import type { TodoLink } from '../shared/todo';
import { addTodoItem, Menu } from './Binder';
import {
  chapterNumbers,
  topItems,
  unplacedChapters,
} from '../shared/manuscript-order';
import { OutlineNotes } from './OutlineNotes';
import { ReadOnlyContext } from './read-only';
import type { Reveal } from './reveal';
import { UNPLACED } from './overview';
import { StatusAndTagsEditor } from './StatusAndTags';
import { UnitImageButtons, unitImageItems, UnitThumbnail } from './UnitImage';

/**
 * A Chapter as index cards: its own Outline and Notes in a wide card, then
 * its Scenes as numbered cards, each editable in place, Status and Tags
 * too. Its image is beside its title, and set from its card. `reveal` goes
 * to the Chapter's Outline.
 */
export function ChapterCorkboard({
  chapter,
  language,
  reveal,
  onOpenScene,
  onAddTodo,
}: {
  chapter: ManuscriptChapter;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenScene(id: string): void;
  /** Starts a Todo linked to a card's unit, from its menu. */
  onAddTodo(link: TodoLink): void;
}) {
  return (
    <div className="corkboard">
      <OwnCard unit={chapter} language={language} reveal={reveal} />
      <div className="scene-cards">
        <SceneCards
          scenes={chapter.scenes}
          language={language}
          onOpenScene={onOpenScene}
          onAddTodo={onAddTodo}
        />
      </div>
    </div>
  );
}

/**
 * A Part as index cards: its own Outline and Notes in a wide card, then its
 * Chapters as cards numbered in the Manuscript's reading order, each
 * editable in place, Status and Tags too. Its image is beside its title,
 * and set from its card. `reveal` goes to the Part's Outline.
 */
export function PartCorkboard({
  part,
  manuscript,
  language,
  reveal,
  onOpenChapter,
  onAddTodo,
}: {
  part: ManuscriptPart;
  manuscript: Manuscript;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenChapter(id: string): void;
  /** Starts a Todo linked to a card's unit, from its menu. */
  onAddTodo(link: TodoLink): void;
}) {
  const item = topItems(manuscript).find(
    (item) => item.kind === 'part' && item.part.id === part.id,
  );
  const chapters = item?.kind === 'part' ? item.chapters : [];
  return (
    <div className="corkboard">
      <OwnCard unit={part} language={language} reveal={reveal} />
      <div className="scene-cards">
        <ChapterCards
          chapters={chapters}
          numbers={chapterNumbers(manuscript)}
          language={language}
          onOpenChapter={onOpenChapter}
          onAddTodo={onAddTodo}
        />
      </div>
    </div>
  );
}

/**
 * The title of the unit a Corkboard is of, its image beside it, then its
 * Outline and Notes in a wide card, with its Status, Tags and image.
 */
function OwnCard({
  unit,
  language,
  reveal,
}: {
  unit: ManuscriptPart | ManuscriptChapter;
  language: ProseLanguage;
  reveal?: Reveal;
}) {
  return (
    <>
      <div className="corkboard-title">
        <h2 className="centre-title">{unit.title}</h2>
        <UnitThumbnail unit={unit} />
      </div>
      <article className="card wide own" aria-label={unit.title}>
        <OutlineNotes
          unitId={unit.id}
          language={language}
          withNotes
          reveal={reveal}
        />
        <StatusAndTagsEditor unit={unit} />
        <UnitImageButtons unit={unit} />
      </article>
    </>
  );
}

/**
 * The Project Outline in a wide card, then a lane per Part and per Loose
 * Chapter, in order: a Part's card opening sideways to its Chapters' cards,
 * a Chapter's to its Scenes'. The Unplaced Chapters, then the Unplaced
 * Scenes, come last, lanes of their own. Lanes start closed. `reveal` goes
 * to the Project Outline.
 */
export function ProjectCorkboard({
  manuscript,
  language,
  reveal,
  onOpenScene,
  onOpenChapter,
  onOpenPart,
  onAddTodo,
}: {
  manuscript: Manuscript;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenScene(id: string): void;
  onOpenChapter(id: string): void;
  onOpenPart(id: string): void;
  /** Starts a Todo linked to a card's unit, from its menu. */
  onAddTodo(link: TodoLink): void;
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const items = topItems(manuscript);
  const unplaced = unplacedChapters(manuscript);
  const numbers = chapterNumbers(manuscript);
  const hasParts = items.some((item) => item.kind === 'part');
  const lanes = [
    ...items.map((item) =>
      item.kind === 'part' ? item.part.id : item.chapter.id,
    ),
    ...unplaced.map((c) => c.id),
    ...(manuscript.unplaced.length > 0 ? [UNPLACED] : []),
  ];
  const toggle = (id: string) => {
    const next = new Set(shown);
    if (!next.delete(id)) next.add(id);
    setShown(next);
  };
  const what = hasParts ? '' : ' Scenes';

  const chapterLane = (chapter: ManuscriptChapter) => (
    <Lane
      key={chapter.id}
      title={chapter.title}
      what="Scenes"
      count={chapter.scenes.length}
      shown={shown.has(chapter.id)}
      onToggle={() => toggle(chapter.id)}
      cards={
        <SceneCards
          scenes={chapter.scenes}
          language={language}
          onOpenScene={onOpenScene}
          onAddTodo={onAddTodo}
        />
      }
    >
      <ChapterCard
        chapter={chapter}
        number={numbers.get(chapter.id)}
        own
        language={language}
        onOpen={() => onOpenChapter(chapter.id)}
        onAddTodo={() => onAddTodo({ kind: 'chapter', id: chapter.id })}
      />
    </Lane>
  );

  return (
    <div className="corkboard">
      <h2 className="centre-title">Project Outline</h2>
      <article className="card wide own" aria-label="Project Outline">
        <OutlineNotes
          unitId={PROJECT_OUTLINE}
          language={language}
          withNotes={false}
          reveal={reveal}
        />
      </article>
      <div className="corkboard-heading">
        <h3>
          {hasParts && (
            <>
              {partName(manuscript.partLabel, true)}{' '}
              <span className="corkboard-count">
                {manuscript.parts?.length ?? 0}
              </span>
              {' · '}
            </>
          )}
          Chapters <span className="corkboard-count">{numbers.size}</span>
        </h3>
        <button
          disabled={lanes.every((id) => shown.has(id))}
          onClick={() => setShown(new Set(lanes))}
        >
          Show all{what}
        </button>
        <button
          disabled={lanes.every((id) => !shown.has(id))}
          onClick={() => setShown(new Set())}
        >
          Hide all{what}
        </button>
      </div>
      {items.map((item) => {
        if (item.kind === 'chapter') return chapterLane(item.chapter);
        const { part, chapters } = item;
        return (
          <Lane
            key={part.id}
            title={part.title}
            what="Chapters"
            count={chapters.length}
            shown={shown.has(part.id)}
            onToggle={() => toggle(part.id)}
            cards={
              <ChapterCards
                chapters={chapters}
                numbers={numbers}
                language={language}
                onOpenChapter={onOpenChapter}
                onAddTodo={onAddTodo}
              />
            }
          >
            <article className="card own part" aria-label={part.title}>
              <CardTitle
                unit={part}
                onOpen={() => onOpenPart(part.id)}
                onAddTodo={() => onAddTodo({ kind: 'part', id: part.id })}
              />
              <OutlineNotes unitId={part.id} language={language} withNotes />
              <StatusAndTagsEditor unit={part} />
            </article>
          </Lane>
        );
      })}
      {unplaced.length > 0 && (
        <>
          <div className="corkboard-heading">
            <h3>Unplaced Chapters</h3>
          </div>
          {unplaced.map(chapterLane)}
        </>
      )}
      {lanes.includes(UNPLACED) && (
        <Lane
          title="Unplaced Scenes"
          what="Scenes"
          count={manuscript.unplaced.length}
          shown={shown.has(UNPLACED)}
          onToggle={() => toggle(UNPLACED)}
          cards={
            <SceneCards
              scenes={manuscript.unplaced}
              language={language}
              onOpenScene={onOpenScene}
              onAddTodo={onAddTodo}
            />
          }
        >
          <div className="card own unplaced">
            <span className="card-title">Unplaced Scenes</span>
          </div>
        </Lane>
      )}
    </div>
  );
}

/**
 * A row of cards: the lane's own card, the control that shows or hides
 * `what` it holds, Scenes or Chapters, and, while shown, their `cards`.
 */
function Lane({
  title,
  what,
  count,
  shown,
  onToggle,
  cards,
  children,
}: {
  title: string;
  what: 'Scenes' | 'Chapters';
  count: number;
  shown: boolean;
  onToggle(): void;
  cards: ReactNode;
  children: ReactNode;
}) {
  const one = what === 'Scenes' ? 'Scene' : 'Chapter';
  return (
    <section className="lane" aria-label={`Lane: ${title}`}>
      {children}
      <button
        className="lane-toggle"
        aria-expanded={shown}
        aria-label={`${what} of ${title}`}
        title={shown ? `Hide ${what}` : `Show ${what}`}
        onClick={onToggle}
      >
        <span aria-hidden="true">{shown ? '◂' : '▸'}</span>
        <span className="lane-count">
          {count === 1 ? `1 ${one}` : `${count} ${what}`}
        </span>
      </button>
      {shown && cards}
    </section>
  );
}

/** Chapters as cards numbered in reading order, or a word that there are none. */
function ChapterCards({
  chapters,
  numbers,
  language,
  onOpenChapter,
  onAddTodo,
}: {
  chapters: ManuscriptChapter[];
  numbers: ReadonlyMap<string, number>;
  language: ProseLanguage;
  onOpenChapter(id: string): void;
  onAddTodo(link: TodoLink): void;
}) {
  if (chapters.length === 0) {
    return <p className="corkboard-empty">No Chapters yet.</p>;
  }
  return chapters.map((chapter) => (
    <ChapterCard
      key={chapter.id}
      chapter={chapter}
      number={numbers.get(chapter.id)}
      language={language}
      onOpen={() => onOpenChapter(chapter.id)}
      onAddTodo={() => onAddTodo({ kind: 'chapter', id: chapter.id })}
    />
  ));
}

/** A Chapter's card; `own` as its lane's own card. */
function ChapterCard({
  chapter,
  number,
  own = false,
  language,
  onOpen,
  onAddTodo,
}: {
  chapter: ManuscriptChapter;
  number?: number;
  own?: boolean;
  language: ProseLanguage;
  onOpen(): void;
  onAddTodo(): void;
}) {
  return (
    <article className={own ? 'card own' : 'card'} aria-label={chapter.title}>
      <CardTitle
        unit={chapter}
        number={number}
        onOpen={onOpen}
        onAddTodo={onAddTodo}
      />
      <OutlineNotes unitId={chapter.id} language={language} withNotes />
      <StatusAndTagsEditor unit={chapter} />
    </article>
  );
}

/** Scenes as numbered cards, or a word that there are none. */
function SceneCards({
  scenes,
  language,
  onOpenScene,
  onAddTodo,
}: {
  scenes: ManuscriptScene[];
  language: ProseLanguage;
  onOpenScene(id: string): void;
  onAddTodo(link: TodoLink): void;
}) {
  if (scenes.length === 0) {
    return <p className="corkboard-empty">No Scenes yet.</p>;
  }
  return scenes.map((scene, i) => (
    <SceneCard
      key={scene.id}
      scene={scene}
      number={i + 1}
      language={language}
      onOpen={() => onOpenScene(scene.id)}
      onAddTodo={() => onAddTodo({ kind: 'scene', id: scene.id })}
    />
  ));
}

function SceneCard({
  scene,
  number,
  language,
  onOpen,
  onAddTodo,
}: {
  scene: ManuscriptScene;
  number: number;
  language: ProseLanguage;
  onOpen(): void;
  onAddTodo(): void;
}) {
  return (
    <article className="card" aria-label={scene.title}>
      <CardTitle
        unit={scene}
        number={number}
        onOpen={onOpen}
        onAddTodo={onAddTodo}
      />
      {scene.missing ? (
        <p className="corkboard-empty">Missing, possibly not synced yet.</p>
      ) : (
        <>
          <OutlineNotes unitId={scene.id} language={language} withNotes />
          <StatusAndTagsEditor unit={scene} />
        </>
      )}
    </article>
  );
}

/**
 * A card's number, if it has one, title, image and ⋯ menu, which a
 * right-click on it opens too; the title opens the unit.
 */
function CardTitle({
  unit,
  number,
  onOpen,
  onAddTodo,
}: {
  unit: ManuscriptPart | ManuscriptChapter | ManuscriptScene;
  number?: number;
  onOpen(): void;
  onAddTodo(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const { title } = unit;
  return (
    <header
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      {number !== undefined && <span className="card-number">{number}</span>}
      <button
        className="card-title"
        aria-label={`Open ${title}`}
        onClick={onOpen}
      >
        {title}
      </button>
      <UnitThumbnail unit={unit} />
      <Menu
        label={`Card actions: ${title}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[
          ...unitImageItems(unit, readOnly),
          addTodoItem(readOnly, onAddTodo),
        ]}
      />
    </header>
  );
}
