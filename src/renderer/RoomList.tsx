import { useContext, useId, useState } from 'react';
import type { ConversationSummary } from '../shared/conversation';
import { Menu, TitleInput } from './Binder';
import { conversationActions, type ConversationState } from './Conversation';
import { ReadOnlyContext } from './read-only';
import { starredFirst } from './starred';

/**
 * A room's Conversations on the left, latest first, the Starred in a group
 * of their own on top, the one open marked, with a button for a new one;
 * `detail` says more of each, if anything. Each can be starred, renamed in
 * place, or moved to Trash.
 */
export function RoomList({
  label,
  width,
  conversations,
  conversation,
  detail,
}: {
  label: string;
  width: number;
  conversations: ConversationSummary[];
  conversation: ConversationState;
  detail?(conversation: ConversationSummary): string | null;
}) {
  const { current, streaming, resume, rename, star } = conversation;
  const readOnly = useContext(ReadOnlyContext);
  /** The Conversation whose title is being edited, if any. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const { starred, rest } = starredFirst(conversations);
  const starredHeading = useId();

  function row(c: ConversationSummary) {
    const more = detail?.(c);
    return (
      <li key={c.id} className="room-conversation">
        {renaming === c.id ? (
          <TitleInput
            title={c.title}
            onDone={(title) => {
              setRenaming(null);
              if (title) void rename(c.id, title);
            }}
          />
        ) : (
          <button
            className="binder-title"
            aria-current={c.id === current?.id ? 'true' : undefined}
            onClick={() => void resume(c.id)}
            disabled={streaming !== null}
          >
            {c.title}
            {more && <span className="room-detail">{more}</span>}
          </button>
        )}
        <button
          className="room-star"
          aria-label={`Star ${c.title}`}
          aria-pressed={c.starred === true}
          title={c.starred ? 'Unstar' : 'Star'}
          onClick={() => void star(c.id, !c.starred)}
          disabled={readOnly}
        >
          {c.starred ? '★' : '☆'}
        </button>
        <Menu
          label={`Conversation actions: ${c.title}`}
          items={conversationActions(
            conversation,
            c.id,
            () => setRenaming(c.id),
            readOnly,
          )}
        />
      </li>
    );
  }

  return (
    <nav className="left-pane room-list" aria-label={label} style={{ width }}>
      <button
        className="room-new"
        onClick={() => void resume('')}
        disabled={streaming !== null}
        aria-current={current === null ? 'true' : undefined}
      >
        New Conversation
      </button>
      {starred.length > 0 && (
        <>
          <h2 className="room-group" id={starredHeading}>
            Starred
          </h2>
          <ul className="room-conversations" aria-labelledby={starredHeading}>
            {starred.map(row)}
          </ul>
        </>
      )}
      <ul className="room-conversations">{rest.map(row)}</ul>
    </nav>
  );
}
