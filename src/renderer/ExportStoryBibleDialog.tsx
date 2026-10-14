import { useEffect, useRef, useState } from 'react';
import { appearsAfter, summaryAsOf } from '../shared/evolution';
import { ALL_BOOKS } from '../shared/export-choice';
import { matchesFilter } from '../shared/filter';
import type { EntrySummary, ManuscriptBook } from '../shared/project-types';
import { FilterControl, useFilter } from './Filter';

/**
 * File › Export Story Bible…: which Entries go in, all of them unless a
 * Filter narrows them, and whether with their images and private notes,
 * before the save dialog. The Filter and the images choice are remembered
 * for the Project on this computer; private notes start off every time. In
 * a Series, the Entries are as of one Book, `book` to start with, or else
 * the last, leaving out those that first appear later; or with every
 * Evolution, as of all Books.
 */
export function ExportStoryBibleDialog({
  entries: all,
  books,
  book,
  onClose,
}: {
  entries: EntrySummary[];
  /** The Books of a Series, in reading order; none otherwise. */
  books?: ManuscriptBook[];
  book?: string;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [chosenBook, setChosenBook] = useState(book);
  /**
   * The Book chosen, while it is still one, or `ALL_BOOKS`; none without
   * Books.
   */
  const asOf = !books?.length
    ? undefined
    : chosenBook === ALL_BOOKS
      ? ALL_BOOKS
      : (books.find((b) => b.id === chosenBook) ?? books.at(-1)!).id;
  const ids = (books ?? []).map((b) => b.id);
  const ofBook = asOf === ALL_BOOKS ? undefined : asOf;
  const entries = all
    .filter((entry) => !appearsAfter(entry, ids, ofBook))
    .map((entry) => summaryAsOf(entry, ids, ofBook));
  /** Null until main says whether the last Export had images. */
  const [images, setImages] = useState<boolean | null>(null);
  const [privateNotes, setPrivateNotes] = useState(false);
  const { filter, setFilter, inUse } = useFilter('export-story-bible');
  const included = entries.filter((entry) => matchesFilter(filter, entry));
  useEffect(() => {
    dialogRef.current?.showModal();
    void window.shell.storyBibleExportImages().then(setImages);
  }, []);

  function exportIncluded() {
    if (images === null) return;
    // Gone at once, not on the close event, which would come after a quick reopen.
    onClose();
    void window.shell.exportStoryBible({
      filter,
      images,
      privateNotes,
      ...(asOf !== undefined && { book: asOf }),
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings export"
      aria-labelledby="export-story-bible-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="export-story-bible-heading">Export Story Bible</h2>
      <p className="field-hint">
        Every Entry goes in unless a Filter narrows them. The file type you save
        as sets Word or Markdown.
      </p>
      {books && asOf !== undefined && (
        <label className="export-book">
          As of{' '}
          <select
            aria-label="As of"
            value={asOf}
            onChange={(event) => setChosenBook(event.target.value)}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
            <option value={ALL_BOOKS}>All Books, with every Evolution</option>
          </select>
        </label>
      )}
      <FilterControl
        filter={filter}
        onChange={setFilter}
        inUse={inUse}
        shown={included.length}
        total={entries.length}
      />
      <p className="export-count">
        {included.length === 1 ? '1 Entry' : `${included.length} Entries`}
      </p>
      <label className="setting">
        <input
          type="checkbox"
          checked={images ?? true}
          disabled={images === null}
          aria-describedby="export-images-hint"
          onChange={(event) => setImages(event.target.checked)}
        />
        Include images
      </label>
      <p id="export-images-hint" className="field-hint">
        In Word only: a Markdown file leaves images out.
      </p>
      <label className="setting">
        <input
          type="checkbox"
          checked={privateNotes}
          onChange={(event) => setPrivateNotes(event.target.checked)}
        />
        Include private notes
      </label>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        <button
          disabled={images === null || included.length === 0}
          onClick={exportIncluded}
        >
          Export…
        </button>
      </div>
    </dialog>
  );
}
