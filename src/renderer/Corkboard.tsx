import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CorkboardView } from '../shared/corkboard-view';
import {
  partName,
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptBook,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import type { TodoLink } from '../shared/todo';
import { addTodoItem, Menu } from './Binder';
import {
  bookManuscript,
  chapterNumbers,
  topItems,
  unplacedChapters,
} from '../shared/manuscript-order';
import { outlineBeginning } from './outline-beginning';
import { OutlineNotes } from './OutlineNotes';
import { useUnit } from './use-project';
import { ReadOnlyContext } from './read-only';
import type { Reveal } from './reveal';
import { UNPLACED } from './overview';
import { StatusAndTagsEditor } from './StatusAndTags';
import {
  UnitCardImage,
  UnitImageButtons,
  unitImageItems,
  UnitThumbnail,
} from './UnitImage';
import { useImagePicker } from './ImagePicker';
import { WritingBeatChips } from './Beats';

/** Whether the cards show their images large, not their Outline and Notes. */
const ImagesContext = createContext(false);

/** What the Corkboards show, and the switch between text and images. */
type ViewProps = {
  view: CorkboardView;
  onView(view: CorkboardView): void;
};

/**
 * What every Corkboard shows, as this computer remembers it for the
 * Project; text until it is read. A change made before then wins.
 */
export function useCorkboardView(): [
  CorkboardView,
  (view: CorkboardView) => void,
] {
  const [view, setView] = useState<CorkboardView>('text');
  const changed = useRef(false);
  useEffect(() => {
    let current = true;
    void window.shell.corkboardView().then((stored) => {
      if (current && !changed.current) setView(stored);
    });
    return () => {
      current = false;
    };
  }, []);
  return [
    view,
    (next) => {
      changed.current = true;
      setView(next);
      window.shell.setCorkboardView(next);
    },
  ];
}

/** Text or Images, for every Corkboard of the Project. */
function ViewSwitch({ view, onView }: ViewProps) {
  return (
    <div role="group" aria-label="Cards show" className="mode-switch">
      <button aria-pressed={view === 'text'} onClick={() => onView('text')}>
        Text
      </button>
      <button aria-pressed={view === 'images'} onClick={() => onView('images')}>
        Images
      </button>
    </div>
  );
}

/**
 * A Corkboard's sheet, its cards showing what `view` says; the wide card of
 * the unit it is of shows text either way.
 */
function CorkboardSheet({
  view,
  children,
}: {
  view: CorkboardView;
  children: ReactNode;
}) {
  return (
    <ImagesContext.Provider value={view === 'images'}>
      <div className={view === 'images' ? 'corkboard images' : 'corkboard'}>
        {children}
      </div>
    </ImagesContext.Provider>
  );
}

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
  view,
  onView,
  onOpenScene,
  onAddTodo,
}: ViewProps & {
  chapter: ManuscriptChapter;
  language: ProseLanguage;
  reveal?: Reveal;
  onOpenScene(id: string): void;
  /** Starts a Todo linked to a card's unit, from its menu. */
  onAddTodo(link: TodoLink): void;
}) {
  return (
    <CorkboardSheet view={view}>
      <OwnCard
        unit={chapter}
        language={language}
        reveal={reveal}
        view={view}
        onView={onView}
      />
      <div className="scene-cards">
        <SceneCards
          scenes={chapter.scenes}
          language={language}
          onOpenScene={onOpenScene}
          onAddTodo={onAddTodo}
        />
      </div>
    </CorkboardSheet>
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
  view,
  onView,
  onOpenChapter,
  onAddTodo,
}: ViewProps & {
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
    <CorkboardSheet view={view}>
      <OwnCard
        unit={part}
        language={language}
        reveal={reveal}
        view={view}
        onView={onView}
      />
      <div className="scene-cards">
        <ChapterCards
          chapters={chapters}
          numbers={chapterNumbers(manuscript)}
          language={language}
          onOpenChapter={onOpenChapter}
          onAddTodo={onAddTodo}
        />
      </div>
    </CorkboardSheet>
  );
}

/**
 * The title of the unit a Corkboard is of, its image beside it and the
 * switch between text and images, then its Outline and Notes in a wide
 * card, with its Status, Tags and image.
 */
function OwnCard({
  unit,
  language,
  reveal,
  view,
  onView,
}: ViewProps & {
  unit: ManuscriptBook | ManuscriptPart | ManuscriptChapter;
  language: ProseLanguage;
  reveal?: Reveal;
}) {
  return (
    <>
      <div className="corkboard-title">
        <h2 className="centre-title">{unit.title}</h2>
        <UnitThumbnail unit={unit} />
        <ViewSwitch view={view} onView={onView} />
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

/** What opens from a card on the Project's or a Book's Corkboard. */
type LaneNavigation = {
  onOpenScene(id: string): void;
  onOpenChapter(id: string): void;
  onOpenPart(id: string): void;
  /** Starts a Todo linked to a card's unit, from its menu. */
  onAddTodo(link: TodoLink): void;
};

/**
 * The Project Outline in a wide card, then a lane per Part and per Loose
 * Chapter, in order: a Part's card opening sideways to its Chapters' cards,
 * a Chapter's to its Scenes'. In a Series, the Series Outline, then a lane
 * per Book, opening to its Parts' and Loose Chapters' cards. The Unplaced
 * Chapters, then the Unplaced Scenes, come last, lanes of their own. Lanes
 * start closed. `reveal` goes to the Project Outline.
 */
export function ProjectCorkboard({
  manuscript,
  language,
  reveal,
  view,
  onView,
  onOpenBook,
  ...navigation
}: ViewProps &
  LaneNavigation & {
    manuscript: Manuscript;
    language: ProseLanguage;
    reveal?: Reveal;
    onOpenBook(id: string): void;
  }) {
  const title = manuscript.books ? 'Series Outline' : 'Project Outline';
  return (
    <CorkboardSheet view={view}>
      <div className="corkboard-title">
        <h2 className="centre-title">{title}</h2>
        <ViewSwitch view={view} onView={onView} />
      </div>
      <article className="card wide own" aria-label={title}>
        <OutlineNotes
          unitId={PROJECT_OUTLINE}
          language={language}
          withNotes={false}
          reveal={reveal}
        />
      </article>
      <Lanes
        manuscript={manuscript}
        language={language}
        onOpenBook={onOpenBook}
        {...navigation}
      />
    </CorkboardSheet>
  );
}

/**
 * A Book of a Series as index cards, as a Project of one Book shows: its
 * own Outline and Notes in a wide card, then a lane per Part and per Loose
 * Chapter, its Chapters numbered from its first. `reveal` goes to the
 * Book's Outline.
 */
export function BookCorkboard({
  book,
  manuscript,
  language,
  reveal,
  view,
  onView,
  ...navigation
}: ViewProps &
  LaneNavigation & {
    book: ManuscriptBook;
    manuscript: Manuscript;
    language: ProseLanguage;
    reveal?: Reveal;
  }) {
  return (
    <CorkboardSheet view={view}>
      <OwnCard
        unit={book}
        language={language}
        reveal={reveal}
        view={view}
        onView={onView}
      />
      <Lanes
        manuscript={bookManuscript(manuscript, book.id)}
        language={language}
        {...navigation}
      />
    </CorkboardSheet>
  );
}

/**
 * The lanes of a Corkboard: a lane per Book of a Series, or per Part and
 * Loose Chapter, then the Unplaced Chapters' and Scenes'.
 */
function Lanes({
  manuscript,
  language,
  onOpenScene,
  onOpenChapter,
  onOpenPart,
  onOpenBook,
  onAddTodo,
}: LaneNavigation & {
  manuscript: Manuscript;
  language: ProseLanguage;
  onOpenBook?(id: string): void;
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const { books } = manuscript;
  const items = topItems(manuscript);
  const unplaced = unplacedChapters(manuscript);
  const numbers = chapterNumbers(manuscript);
  const hasParts = items.some((item) => item.kind === 'part');
  const lanes = [
    ...(books
      ? books.map((b) => b.id)
      : items.map((item) =>
          item.kind === 'part' ? item.part.id : item.chapter.id,
        )),
    ...unplaced.map((c) => c.id),
    ...(manuscript.unplaced.length > 0 ? [UNPLACED] : []),
  ];
  const toggle = (id: string) => {
    const next = new Set(shown);
    if (!next.delete(id)) next.add(id);
    setShown(next);
  };
  const what = hasParts || books ? '' : ' Scenes';

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

  /** A Book's Parts' and Loose Chapters' cards, in order. */
  const bookCards = (bookId: string) => {
    const cards = topItems(bookManuscript(manuscript, bookId));
    if (cards.length === 0) {
      return <p className="corkboard-empty">No Chapters yet.</p>;
    }
    return cards.map((item) =>
      item.kind === 'part' ? (
        <UnitCard
          key={item.part.id}
          unit={item.part}
          className="card part"
          language={language}
          onOpen={() => onOpenPart(item.part.id)}
          onAddTodo={() => onAddTodo({ kind: 'part', id: item.part.id })}
        />
      ) : (
        <ChapterCard
          key={item.chapter.id}
          chapter={item.chapter}
          number={numbers.get(item.chapter.id)}
          language={language}
          onOpen={() => onOpenChapter(item.chapter.id)}
          onAddTodo={() => onAddTodo({ kind: 'chapter', id: item.chapter.id })}
        />
      ),
    );
  };

  return (
    <>
      <div className="corkboard-heading">
        <h3>
          {books && (
            <>
              Books <span className="corkboard-count">{books.length}</span>
              {' · '}
            </>
          )}
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
      {books?.map((book) => (
        <Lane
          key={book.id}
          title={book.title}
          what="Cards"
          count={book.top.length}
          shown={shown.has(book.id)}
          onToggle={() => toggle(book.id)}
          cards={bookCards(book.id)}
        >
          <UnitCard
            unit={book}
            className="card own book"
            language={language}
            onOpen={() => onOpenBook?.(book.id)}
            onAddTodo={() => onAddTodo({ kind: 'book', id: book.id })}
          />
        </Lane>
      ))}
      {!books &&
        items.map((item) => {
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
              <UnitCard
                unit={part}
                className="card own part"
                language={language}
                onOpen={() => onOpenPart(part.id)}
                onAddTodo={() => onAddTodo({ kind: 'part', id: part.id })}
              />
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
    </>
  );
}

/**
 * A row of cards: the lane's own card, the control that shows or hides
 * `what` it holds, Scenes, Chapters, or a Book's Parts and Chapters as
 * Cards, and, while shown, their `cards`.
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
  what: 'Scenes' | 'Chapters' | 'Cards';
  count: number;
  shown: boolean;
  onToggle(): void;
  cards: ReactNode;
  children: ReactNode;
}) {
  const one =
    what === 'Scenes' ? 'Scene' : what === 'Cards' ? 'Card' : 'Chapter';
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
    <UnitCard
      unit={chapter}
      number={number}
      className={own ? 'card own' : 'card'}
      language={language}
      onOpen={onOpen}
      onAddTodo={onAddTodo}
    />
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
    <UnitCard
      unit={scene}
      number={number}
      className="card"
      missing={scene.missing}
      beats={<WritingBeatChips sceneId={scene.id} />}
      language={language}
      onOpen={onOpen}
      onAddTodo={onAddTodo}
    />
  );
}

const MISSING_TEXT = 'Missing, possibly not synced yet.';

type UnitCardProps = {
  unit: ManuscriptBook | ManuscriptPart | ManuscriptChapter | ManuscriptScene;
  number?: number;
  className: string;
  /** Set for a Scene whose file hasn't arrived. */
  missing?: boolean;
  /** A Scene's Beats, shown under its Status and Tags. */
  beats?: ReactNode;
  language: ProseLanguage;
  onOpen(): void;
  onAddTodo(): void;
};

/**
 * A Scene's, Chapter's or Part's card: its Outline and Notes editable in
 * place, then its Status and Tags; or, as the Corkboard shows images, an
 * image card.
 */
function UnitCard(props: UnitCardProps) {
  const images = useContext(ImagesContext);
  if (images) return <ImageCard {...props} />;
  const {
    unit,
    number,
    className,
    missing,
    beats,
    language,
    onOpen,
    onAddTodo,
  } = props;
  return (
    <article className={className} aria-label={unit.title}>
      <CardTitle
        unit={unit}
        number={number}
        onOpen={onOpen}
        onAddTodo={onAddTodo}
      />
      {missing ? (
        <p className="corkboard-empty">{MISSING_TEXT}</p>
      ) : (
        <>
          <OutlineNotes unitId={unit.id} language={language} withNotes />
          <StatusAndTagsEditor unit={unit} />
          {beats}
        </>
      )}
    </article>
  );
}

/**
 * A card as the Corkboard shows images: the unit's image filling its top,
 * Add image… without one, its title beneath, then its Status and Tags.
 * Hovered or focused, it shows its Outline's beginning, as there is one.
 */
function ImageCard({
  unit,
  number,
  className,
  missing,
  beats,
  onOpen,
  onAddTodo,
}: UnitCardProps) {
  const outlineId = useId();
  const outline = outlineBeginning(useOutline(unit.id));
  return (
    <article className={`${className} image-card`} aria-label={unit.title}>
      <div className="card-figure">
        {missing ? (
          <div className="card-image empty">
            <p className="corkboard-empty">{MISSING_TEXT}</p>
          </div>
        ) : (
          <UnitCardImage unit={unit} />
        )}
        {outline && (
          <div role="tooltip" id={outlineId} className="card-outline">
            {outline}
          </div>
        )}
      </div>
      <CardTitle
        unit={unit}
        number={number}
        describedBy={outline ? outlineId : undefined}
        onOpen={onOpen}
        onAddTodo={onAddTodo}
      />
      {!missing && (
        <>
          <StatusAndTagsEditor unit={unit} />
          {beats}
        </>
      )}
    </article>
  );
}

/** A unit's Outline, as it is now. */
function useOutline(unitId: string): string {
  return useUnit({ kind: 'outline', id: unitId })?.body ?? '';
}

/**
 * A card's number, if it has one, title, image, unless the card shows it
 * large, and ⋯ menu, which a right-click on it opens too; the title opens
 * the unit, and is described by `describedBy`.
 */
function CardTitle({
  unit,
  number,
  describedBy,
  onOpen,
  onAddTodo,
}: {
  unit: ManuscriptBook | ManuscriptPart | ManuscriptChapter | ManuscriptScene;
  number?: number;
  describedBy?: string;

  onOpen(): void;
  onAddTodo(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const imagePicker = useImagePicker();
  const images = useContext(ImagesContext);
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
        aria-describedby={describedBy}
        onClick={onOpen}
      >
        {title}
      </button>
      {!images && <UnitThumbnail unit={unit} />}
      <Menu
        label={`Card actions: ${title}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[
          ...unitImageItems(unit, readOnly, imagePicker),
          addTodoItem(readOnly, onAddTodo),
        ]}
      />
    </header>
  );
}
