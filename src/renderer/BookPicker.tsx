import { useContext } from 'react';
import type { ConversationState, Names } from './Conversation';
import { ReadOnlyContext } from './read-only';

/**
 * In a Series, the Book the Brainstorm or Interview open is about, or a new
 * one will be, and a dropdown to change it from its next message on. Not
 * shown in a Project of one Book.
 */
export function BookPicker({
  conversation: { book, chooseBook, streaming },
  names: { manuscript },
}: {
  conversation: ConversationState;
  names: Names;
}) {
  const readOnly = useContext(ReadOnlyContext);
  if (!manuscript.books || book === undefined) return null;
  return (
    <label className="interview-focus conversation-book">
      Book
      <select
        aria-label="Book"
        value={book}
        onChange={(event) => void chooseBook(event.target.value)}
        disabled={readOnly || streaming !== null}
      >
        {manuscript.books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))}
      </select>
    </label>
  );
}
