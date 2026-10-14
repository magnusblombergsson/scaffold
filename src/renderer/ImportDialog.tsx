import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImportFile } from '../shared/api';
import {
  CHAPTER_SPLIT_LABELS,
  defaultConvention,
  importedChapters,
  PART_SPLIT_LABEL,
  partSplitOffered,
  plainText,
  SCENE_SPLIT_LABELS,
  sceneSplitAllowed,
  splitManuscript,
  wordCount,
  type ChapterSplit,
  type ImportConvention,
  type ImportedChapter,
  type SceneSplit,
} from '../shared/manuscript-import';
import { countOf } from './word-count';

/** How many words of a Scene's opening the preview shows. */
const OPENING_WORDS = 12;

/**
 * The preview of an Import: the Parts, Chapters and Scenes the file splits
 * into, and where it splits them, which the Author can change before the new
 * Project is created, or with `onImportBook`, a new Book after the last of
 * the open Project. Parts are offered only when the file has Heading 1s and
 * Heading 2s, and never chosen for the Author.
 */
export function ImportDialog({
  file,
  onImport,
  onImportBook,
  onClose,
}: {
  file: ImportFile;
  onImport(convention: ImportConvention): void;
  onImportBook?(convention: ImportConvention): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [convention, setConvention] = useState(() =>
    defaultConvention(file.blocks),
  );
  const items = useMemo(
    () => splitManuscript(file.blocks, convention),
    [file, convention],
  );
  const chapters = importedChapters(items);
  const partCount = items.length - items.filter((i) => 'scenes' in i).length;
  const partsOffered = useMemo(() => partSplitOffered(file.blocks), [file]);
  const sceneCount = chapters.reduce((sum, c) => sum + c.scenes.length, 0);
  const words = chapters.reduce(
    (sum, c) => sum + c.scenes.reduce((n, s) => n + wordCount(s.paragraphs), 0),
    0,
  );

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function setChapters(chapters: ChapterSplit, parts = false) {
    setConvention(({ scenes }) => ({
      ...(parts && { parts }),
      chapters,
      scenes: sceneSplitAllowed(scenes, chapters) ? scenes : 'separator',
    }));
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings import"
      aria-labelledby="import-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="import-heading">Import {file.name}</h2>
      <p className="import-hint">
        {onImportBook
          ? 'Check where the file is split. Nothing is written until you add it as a new Book after the last, or create a new Project.'
          : 'Check where the file is split. Nothing is written until you create the new Project.'}
      </p>
      <div className="import-convention">
        <label>
          New Chapter at{' '}
          <select
            value={convention.chapters}
            disabled={convention.parts}
            onChange={(e) => setChapters(e.target.value as ChapterSplit)}
          >
            {Object.entries(CHAPTER_SPLIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {partsOffered && (
          <label>
            <input
              type="checkbox"
              checked={convention.parts ?? false}
              onChange={(e) =>
                e.target.checked
                  ? setChapters('heading2', true)
                  : setChapters('heading1')
              }
            />{' '}
            {PART_SPLIT_LABEL}
          </label>
        )}
        <label>
          New Scene at{' '}
          <select
            value={convention.scenes}
            onChange={(e) =>
              setConvention({
                ...convention,
                scenes: e.target.value as SceneSplit,
              })
            }
          >
            {Object.entries(SCENE_SPLIT_LABELS).map(([value, label]) => (
              <option
                key={value}
                value={value}
                disabled={
                  !sceneSplitAllowed(value as SceneSplit, convention.chapters)
                }
              >
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="import-summary" aria-live="polite">
        {partCount > 0 && `${countOf(partCount, 'Part')}, `}
        {countOf(chapters.length, 'Chapter')}, {countOf(sceneCount, 'Scene')},{' '}
        {countOf(words, 'word')}
      </p>
      <ol className="import-preview" aria-label="Chapters and Scenes">
        {items.map((item, i) =>
          'scenes' in item ? (
            <ChapterPreview key={i} chapter={item} />
          ) : (
            <li key={i}>
              <span className="import-part">{item.title}</span>
              <ol>
                {item.chapters.map((chapter, j) => (
                  <ChapterPreview key={j} chapter={chapter} />
                ))}
              </ol>
            </li>
          ),
        )}
      </ol>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        {onImportBook && (
          <button onClick={() => onImportBook(convention)}>
            Add as New Book
          </button>
        )}
        <button onClick={() => onImport(convention)}>Create Project…</button>
      </div>
    </dialog>
  );
}

/** A Chapter in the preview, with its Scenes' titles, length and opening. */
function ChapterPreview({ chapter }: { chapter: ImportedChapter }) {
  return (
    <li>
      <span className="import-chapter">{chapter.title}</span>
      <ol>
        {chapter.scenes.map((scene, j) => (
          <li key={j}>
            <span className="import-scene">{scene.title}</span>{' '}
            <span className="import-words">
              {countOf(wordCount(scene.paragraphs), 'word')}
            </span>
            <span className="import-opening">
              {opening(
                scene.paragraphs.map(({ spans }) => plainText(spans)).join(' '),
              )}
            </span>
          </li>
        ))}
      </ol>
    </li>
  );
}

function opening(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > OPENING_WORDS
    ? `${words.slice(0, OPENING_WORDS).join(' ')}…`
    : words.join(' ');
}
