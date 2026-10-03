import type { ConversationSummary } from '../shared/conversation';
import type { ConversationState } from './Conversation';

/**
 * A room's Conversations on the left, latest first, the one open marked,
 * with a button for a new one; `detail` says more of each, if anything.
 */
export function RoomList({
  label,
  width,
  conversations,
  conversation: { current, streaming, resume },
  detail,
}: {
  label: string;
  width: number;
  conversations: ConversationSummary[];
  conversation: ConversationState;
  detail?(conversation: ConversationSummary): string | null;
}) {
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
            <li key={c.id}>
              <button
                className="binder-title"
                aria-current={c.id === current?.id ? 'true' : undefined}
                onClick={() => void resume(c.id)}
                disabled={streaming !== null}
              >
                {c.title}
                {more && <span className="room-detail">{more}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
