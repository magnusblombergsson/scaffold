import { useState, type ReactNode } from 'react';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import { OutlineNotes } from './OutlineNotes';
import type { Reveal } from './reveal';
import { UNPLACED } from './overview';

/**
 * A Chapter as index cards: its own Outline and Notes in a wide card, then
 * its Scenes as numbered cards, each editable in place. `reveal` goes to
 * the Chapter's Outline.
 */
export function ChapterCorkboard({
  chapter,
  language,
  reveal,
  onOpenScene,
}: {
  chapter: ManuscriptChapter;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenScene(id: string): void;
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
      </article>
      <div className="scene-cards">
        <SceneCards
          scenes={chapter.scenes}
          language={language}
          onOpenScene={onOpenScene}
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
}: {
  manuscript: Manuscript;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenScene(id: string): void;
  onOpenChapter(id: string): void;
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
        >
          <article className="card own" aria-label={chapter.title}>
            <CardTitle
              title={chapter.title}
              number={i + 1}
              onOpen={() => onOpenChapter(chapter.id)}
            />
            <OutlineNotes unitId={chapter.id} language={language} withNotes />
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
  children,
}: {
  title: string;
  scenes: ManuscriptScene[];
  shown: boolean;
  onToggle(): void;
  language: ProseLanguage;
  onOpenScene(id: string): void;
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
}: {
  scenes: ManuscriptScene[];
  language: ProseLanguage;
  onOpenScene(id: string): void;
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
    />
  ));
}

function SceneCard({
  scene,
  number,
  language,
  onOpen,
}: {
  scene: ManuscriptScene;
  number: number;
  language: ProseLanguage;
  onOpen(): void;
}) {
  return (
    <article className="card" aria-label={scene.title}>
      <CardTitle title={scene.title} number={number} onOpen={onOpen} />
      {scene.missing ? (
        <p className="corkboard-empty">Missing, possibly not synced yet.</p>
      ) : (
        <OutlineNotes unitId={scene.id} language={language} withNotes />
      )}
    </article>
  );
}

/** A card's number and title; the title opens the unit. */
function CardTitle({
  title,
  number,
  onOpen,
}: {
  title: string;
  number: number;
  onOpen(): void;
}) {
  return (
    <header>
      <span className="card-number">{number}</span>
      <button
        className="card-title"
        aria-label={`Open ${title}`}
        onClick={onOpen}
      >
        {title}
      </button>
    </header>
  );
}
