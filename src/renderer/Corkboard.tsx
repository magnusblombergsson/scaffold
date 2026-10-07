import { useContext, useState, type ReactNode } from 'react';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import type { TodoLink } from '../shared/todo';
import { addTodoItem, Menu } from './Binder';
import { OutlineNotes } from './OutlineNotes';
import { ReadOnlyContext } from './read-only';
import type { Reveal } from './reveal';
import { UNPLACED } from './overview';
import { StatusAndTagsEditor } from './StatusAndTags';

/**
 * A Chapter as index cards: its own Outline and Notes in a wide card, then
 * its Scenes as numbered cards, each editable in place, Status and Tags
 * too. `reveal` goes to the Chapter's Outline.
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
      <h2 className="centre-title">{chapter.title}</h2>
      <article className="card wide own" aria-label={chapter.title}>
        <OutlineNotes
          unitId={chapter.id}
          language={language}
          withNotes
          reveal={reveal}
        />
        <StatusAndTagsEditor unit={chapter} />
      </article>
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
 * The Project Outline in a wide card, then a lane per Chapter: the
 * Chapter's card, opening sideways to its Scenes' cards. The Unplaced Scenes
 * come last, as a lane of their own. Lanes start with their Scenes hidden.
 * `reveal` goes to the Project Outline.
 */
export function ProjectCorkboard({
  manuscript,
  language,
  reveal,
  onOpenScene,
  onOpenChapter,
  onAddTodo,
}: {
  manuscript: Manuscript;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenScene(id: string): void;
  onOpenChapter(id: string): void;
  /** Starts a Todo linked to a card's unit, from its menu. */
  onAddTodo(link: TodoLink): void;
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const lanes = [
    ...manuscript.chapters.map((c) => c.id),
    ...(manuscript.unplaced.length > 0 ? [UNPLACED] : []),
  ];
  const toggle = (id: string) => {
    const next = new Set(shown);
    if (!next.delete(id)) next.add(id);
    setShown(next);
  };

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
          Chapters{' '}
          <span className="corkboard-count">{manuscript.chapters.length}</span>
        </h3>
        <button
          disabled={lanes.every((id) => shown.has(id))}
          onClick={() => setShown(new Set(lanes))}
        >
          Show all Scenes
        </button>
        <button
          disabled={lanes.every((id) => !shown.has(id))}
          onClick={() => setShown(new Set())}
        >
          Hide all Scenes
        </button>
      </div>
      {manuscript.chapters.map((chapter, i) => (
        <Lane
          key={chapter.id}
          title={chapter.title}
          scenes={chapter.scenes}
          shown={shown.has(chapter.id)}
          onToggle={() => toggle(chapter.id)}
          language={language}
          onOpenScene={onOpenScene}
          onAddTodo={onAddTodo}
        >
          <article className="card own" aria-label={chapter.title}>
            <CardTitle
              title={chapter.title}
              number={i + 1}
              onOpen={() => onOpenChapter(chapter.id)}
              onAddTodo={() => onAddTodo({ kind: 'chapter', id: chapter.id })}
            />
            <OutlineNotes unitId={chapter.id} language={language} withNotes />
            <StatusAndTagsEditor unit={chapter} />
          </article>
        </Lane>
      ))}
      {lanes.includes(UNPLACED) && (
        <Lane
          title="Unplaced Scenes"
          scenes={manuscript.unplaced}
          shown={shown.has(UNPLACED)}
          onToggle={() => toggle(UNPLACED)}
          language={language}
          onOpenScene={onOpenScene}
          onAddTodo={onAddTodo}
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
 * A row of cards: the lane's own card, the control that shows or hides its
 * Scenes, and, while shown, the Scenes' cards.
 */
function Lane({
  title,
  scenes,
  shown,
  onToggle,
  language,
  onOpenScene,
  onAddTodo,
  children,
}: {
  title: string;
  scenes: ManuscriptScene[];
  shown: boolean;
  onToggle(): void;
  language: ProseLanguage;
  onOpenScene(id: string): void;
  onAddTodo(link: TodoLink): void;
  children: ReactNode;
}) {
  return (
    <section className="lane" aria-label={`Lane: ${title}`}>
      {children}
      <button
        className="lane-toggle"
        aria-expanded={shown}
        aria-label={`Scenes of ${title}`}
        title={shown ? 'Hide Scenes' : 'Show Scenes'}
        onClick={onToggle}
      >
        <span aria-hidden="true">{shown ? '◂' : '▸'}</span>
        <span className="lane-count">
          {scenes.length === 1 ? '1 Scene' : `${scenes.length} Scenes`}
        </span>
      </button>
      {shown && (
        <SceneCards
          scenes={scenes}
          language={language}
          onOpenScene={onOpenScene}
          onAddTodo={onAddTodo}
        />
      )}
    </section>
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
        title={scene.title}
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
 * A card's number, title and ⋯ menu, which a right-click on it opens too;
 * the title opens the unit.
 */
function CardTitle({
  title,
  number,
  onOpen,
  onAddTodo,
}: {
  title: string;
  number: number;
  onOpen(): void;
  onAddTodo(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <span className="card-number">{number}</span>
      <button
        className="card-title"
        aria-label={`Open ${title}`}
        onClick={onOpen}
      >
        {title}
      </button>
      <Menu
        label={`Card actions: ${title}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[addTodoItem(readOnly, onAddTodo)]}
      />
    </header>
  );
}
