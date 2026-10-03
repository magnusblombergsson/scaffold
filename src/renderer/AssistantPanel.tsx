import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type {
  Conversation,
  ConversationMessage,
  ConversationSummary,
} from '../shared/conversation';
import { NoKeyState, useKeyStatus } from './ApiKey';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';

/**
 * The Assistant beside the editor. Without an API key it only asks for one;
 * everything else in the window works without.
 */
export function AssistantPanel({
  onAddKey,
  sceneId,
}: {
  onAddKey(): void;
  /** The Scene open in the editor, which a message sent now is about. */
  sceneId: string | null;
}) {
  const status = useKeyStatus();
  return (
    <aside className="assistant-panel" aria-label="Assistant">
      <h2 className="assistant-heading">Assistant</h2>
      {status &&
        (status.masked ? (
          <Conversations sceneId={sceneId} />
        ) : (
          <NoKeyState onAddKey={onAddKey} />
        ))}
    </aside>
  );
}

/** The longest title a Conversation gets from its first message. */
const TITLE_LENGTH = 60;

/** A Conversation's title, from the first line of its first message. */
function titleOf(message: string): string {
  const line = message.trim().split('\n')[0].trim();
  return line.length > TITLE_LENGTH
    ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
    : line;
}

/**
 * Writing Conversations: a picker to resume one, its messages, and where the
 * Author writes the next. A new one starts when its first message is sent.
 * The Assistant's replies are plain text: nothing here puts them in the
 * Manuscript, though the Author can copy them as any text.
 */
function Conversations({ sceneId }: { sceneId: string | null }) {
  const readOnly = useContext(ReadOnlyContext);
  const [list, setList] = useState<ConversationSummary[]>([]);
  /** The Conversation shown; null for a new one, not yet started. */
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  /** The reply streaming in, while the Assistant answers. */
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.assistant.listConversations().then(setList);
  }, []);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView?.({ block: 'end' });
  }, [current?.messages.length, streaming]);

  async function resume(id: string) {
    setError(null);
    if (id === '') {
      setCurrent(null);
      return;
    }
    try {
      setCurrent(await window.assistant.readConversation(id));
    } catch (error) {
      setError(`Can't open the Conversation: ${(error as Error).message}`);
    }
  }

  async function send(event: { preventDefault(): void }) {
    event.preventDefault();
    const message = draft.trim();
    if (message === '' || streaming !== null) return;
    // What the Author typed last reaches main before the request is built.
    flushPendingEdits();
    setError(null);
    setStreaming('');
    let conversation = current;
    try {
      if (!conversation) {
        const started = await window.assistant.startConversation(
          'writing',
          titleOf(message),
        );
        conversation = { ...started, messages: [] };
        setList((list) => [started, ...list]);
      }
      const authored: ConversationMessage = {
        role: 'author',
        text: message,
        focus: sceneId ? [sceneId] : [],
        at: Date.now(),
      };
      const asked = conversation;
      setCurrent({ ...asked, messages: [...asked.messages, authored] });
      setDraft('');
      await window.assistant.ask(asked.id, message, sceneId, (text) =>
        setStreaming((so) => (so ?? '') + text),
      );
      // The log, not this window, says what was sent and when.
      setCurrent(await window.assistant.readConversation(asked.id));
    } catch (error) {
      setError(`The Assistant couldn't answer: ${(error as Error).message}`);
    } finally {
      setStreaming(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) void send(event);
  }

  return (
    <div className="conversations">
      <div className="conversation-picker">
        <select
          aria-label="Conversation"
          value={current?.id ?? ''}
          onChange={(event) => void resume(event.target.value)}
          disabled={streaming !== null}
        >
          <option value="">New Conversation</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <div className="messages" role="log" aria-label="Messages">
        {!current && list.length === 0 && (
          <p className="assistant-empty">No Conversations yet.</p>
        )}
        {current?.messages.map((m, i) => (
          <Message key={i} role={m.role} text={m.text} />
        ))}
        {streaming !== null && streaming !== '' && (
          <Message role="assistant" text={streaming} />
        )}
        <div ref={messagesEnd} />
      </div>
      {error && (
        <p className="assistant-error" role="alert">
          {error}
        </p>
      )}
      <form className="composer" onSubmit={send}>
        <textarea
          aria-label="Message"
          placeholder={sceneId ? 'Ask about this Scene…' : 'Ask the Assistant…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={readOnly}
          rows={3}
        />
        <button
          type="submit"
          disabled={readOnly || streaming !== null || draft.trim() === ''}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Message({
  role,
  text,
}: {
  role: ConversationMessage['role'];
  text: string;
}) {
  return (
    <article
      className={`message message-${role}`}
      aria-label={role === 'author' ? 'You' : 'Assistant'}
    >
      {text}
    </article>
  );
}
