import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImportFile } from '../shared/api';
import {
  CHAPTER_SPLIT_LABELS,
  defaultConvention,
  plainText,
  SCENE_SPLIT_LABELS,
  sceneSplitAllowed,
  splitManuscript,
  wordCount,
  type ChapterSplit,
  type ImportConvention,
  type SceneSplit,
} from '../shared/manuscript-import';
import { countOf } from './word-count';

/** How many words of a Scene's opening the preview shows. */
const OPENING_WORDS = 12;

/**
 * The preview of an Import: the Chapters and Scenes the file splits into,
 * and where it splits them, which the Author can change before the new
 * Project is created.
 */
export function ImportDialog({
  file,
  onImport,
  onClose,
}: {
  file: ImportFile;
  onImport(convention: ImportConvention): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [convention, setConvention] = useState(() =>
    defaultConvention(file.blocks),
  );
  const chapters = useMemo(
    () => splitManuscript(file.blocks, convention),
    [file, convention],
  );
  const sceneCount = chapters.reduce((sum, c) => sum + c.scenes.length, 0);
  const words = chapters.reduce(
    (sum, c) => sum + c.scenes.reduce((n, s) => n + wordCount(s.paragraphs), 0),
    0,
  );

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function setChapters(chapters: ChapterSplit) {
    setConvention(({ scenes }) => ({
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
        Check where the file is split. Nothing is written until you create the
        new Project.
      </p>
      <div className="import-convention">
        <label>
          New Chapter at{' '}
          <select
            value={convention.chapters}
            onChange={(e) => setChapters(e.target.value as ChapterSplit)}
          >
            {Object.entries(CHAPTER_SPLIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
        {countOf(chapters.length, 'Chapter')}, {countOf(sceneCount, 'Scene')},{' '}
        {countOf(words, 'word')}
      </p>
      <ol className="import-preview" aria-label="Chapters and Scenes">
        {chapters.map((chapter, i) => (
          <li key={i}>
            <span className="import-chapter">{chapter.title}</span>
            <ol>
              {chapter.scenes.map((scene, j) => (
                <li key={j}>
                  <span className="import-scene">{scene.title}</span>{' '}
                  <span className="import-words">
                    {countOf(wordCount(scene.paragraphs), 'word')}
                  </span>
                  <span className="import-opening">
                    {opening(scene.paragraphs.map(plainText).join(' '))}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        <button onClick={() => onImport(convention)}>Create Project…</button>
      </div>
    </dialog>
  );
}

function opening(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > OPENING_WORDS
    ? `${words.slice(0, OPENING_WORDS).join(' ')}…`
    : words.join(' ');
}
