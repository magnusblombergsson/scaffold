import { useContext, useState } from 'react';
import type { ConversationSummary } from '../shared/conversation';
import { Menu, TitleInput } from './Binder';
import { conversationActions, type ConversationState } from './Conversation';
import { ReadOnlyContext } from './read-only';

/**
 * A room's Conversations on the left, latest first, the one open marked,
 * with a button for a new one; `detail` says more of each, if anything.
 * Each can be renamed in place, or moved to Trash.
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
  const { current, streaming, resume, rename } = conversation;
  const readOnly = useContext(ReadOnlyContext);
  /** The Conversation whose title is being edited, if any. */
  const [renaming, setRenaming] = useState<string | null>(null);
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
      <ul className="room-conversations">
        {conversations.map((c) => {
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
        })}
      </ul>
    </nav>
  );
}
