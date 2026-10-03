import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type {
  AskResult,
  AssistantFailure,
  Conversation,
  ConversationMessage,
  ConversationSummary,
} from '../shared/conversation';
import type { EntrySummary, Manuscript } from '../shared/project-types';
import { replyText } from '../shared/proposal';
import { describeTotal, describeUsage } from '../shared/usage';
import { NoKeyState, useKeyStatus } from './ApiKey';
import { proposalCardId, ProposalCard } from './ProposalCard';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';
import { sawList } from './saw-list';

/** The Project as it is now, which names what the Assistant saw. */
type Names = { manuscript: Manuscript; entries: EntrySummary[] };

/**
 * A Proposal the Author asked to see in its Conversation, from an Entry;
 * `count` tells one ask from the next.
 */
export type ShowProposal = {
  conversationId: string;
  proposalId: string;
  count: number;
};

/**
 * The Assistant beside the editor. Without an API key it only asks for one;
 * everything else in the window works without.
 */
export function AssistantPanel({
  onAddKey,
  sceneId,
  names,
  show,
}: {
  onAddKey(): void;
  /** The Scene open in the editor, which a message sent now is about. */
  sceneId: string | null;
  names: Names;
  show: ShowProposal | null;
}) {
  const status = useKeyStatus();
  return (
    <aside className="assistant-panel" aria-label="Assistant">
      <h2 className="assistant-heading">Assistant</h2>
      {status &&
        (status.masked ? (
          <Conversations
            sceneId={sceneId}
            names={names}
            show={show}
            onOpenSettings={onAddKey}
          />
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

/** What the Author is told when the Assistant couldn't answer. */
const FAILURES: Record<AssistantFailure, string> = {
  key: "Anthropic didn't accept the API key. Check it in Settings, then retry.",
  credit:
    'Your Anthropic account is out of credit. Add credit in Anthropic Console, then retry.',
  'rate-limit':
    'Anthropic is getting too many calls from this key. Wait a moment, then retry.',
  offline: "Can't reach Anthropic. Check the connection, then retry.",
  other: "The Assistant couldn't answer. Retry, or try again later.",
};

/**
 * Writing Conversations: a picker to resume one, its messages, and where the
 * Author writes the next. A new one starts when its first message is sent.
 * The Assistant's replies are plain text: nothing here puts them in the
 * Manuscript, though the Author can copy them as any text. A reply's
 * Proposals show as cards in it, where the Author decides them; a decision
 * made anywhere shows here at once. A failed call shows as a message of its
 * own, with Retry; it isn't in the log.
 */
function Conversations({
  sceneId,
  names,
  show,
  onOpenSettings,
}: {
  sceneId: string | null;
  names: Names;
  show: ShowProposal | null;
  onOpenSettings(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [list, setList] = useState<ConversationSummary[]>([]);
  /** The Conversation shown; null for a new one, not yet started. */
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  /** The reply streaming in, while the Assistant answers. */
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Why the last call failed, until the Author asks again. */
  const [failure, setFailure] = useState<AssistantFailure | null>(null);
  /** The Proposal last shown from an Entry, until another Conversation is opened. */
  const [shown, setShown] = useState<string | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const currentId = useRef<string | null>(null);
  currentId.current = current?.id ?? null;
  const answering = useRef(false);
  answering.current = streaming !== null;

  useEffect(() => {
    void window.assistant.listConversations().then(setList);
  }, []);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView?.({ block: 'end' });
  }, [current?.messages.length, streaming, failure]);

  useEffect(
    () =>
      window.project.subscribe((event) => {
        // A Proposal was decided, or its Entry changed: show where each stands now.
        const changed =
          event.type === 'proposalsChanged' ||
          event.type === 'entriesChanged' ||
          (event.type === 'unitReloaded' && event.ref.kind === 'entry');
        const id = currentId.current;
        if (!changed || !id || answering.current) return;
        void window.assistant.readConversation(id).then((conversation) => {
          if (currentId.current === conversation.id) setCurrent(conversation);
        });
      }),
    [],
  );

  useEffect(() => {
    if (!show || answering.current) return;
    void resume(show.conversationId).then(() => setShown(show.proposalId));
  }, [show]);
  useEffect(() => {
    if (shown) {
      document
        .getElementById(proposalCardId(shown))
        ?.scrollIntoView?.({ block: 'center' });
    }
  }, [shown, current]);

  async function resume(id: string) {
    setError(null);
    setFailure(null);
    setShown(null);
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
    await asking(async () => {
      let conversation = current;
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
      await showResult(
        asked.id,
        window.assistant.ask(asked.id, message, sceneId, onText),
      );
    });
  }

  async function retry() {
    const conversation = current;
    if (!conversation || streaming !== null) return;
    await asking(() =>
      showResult(
        conversation.id,
        window.assistant.retry(conversation.id, onText),
      ),
    );
  }

  /** Runs `ask` while the Assistant answers, its reply streaming in meanwhile. */
  async function asking(ask: () => Promise<void>) {
    // What the Author typed last reaches main before the request is built.
    flushPendingEdits();
    setError(null);
    setFailure(null);
    setStreaming('');
    try {
      await ask();
    } catch (error) {
      setError(`The Assistant couldn't answer: ${(error as Error).message}`);
    } finally {
      setStreaming(null);
    }
  }

  function onText(text: string) {
    setStreaming((so) => (so ?? '') + text);
  }

  /** Shows the Conversation as logged once the call is over, and how it went. */
  async function showResult(id: string, result: Promise<AskResult>) {
    const { failure } = await result;
    // The log, not this window, says what was sent and when.
    setCurrent(await window.assistant.readConversation(id));
    setFailure(failure);
  }

  const total = current
    ? describeTotal(
        current.messages.flatMap((m) =>
          m.model && m.usage ? [{ model: m.model, usage: m.usage }] : [],
        ),
      )
    : null;

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
        {total && (
          <p className="conversation-usage" aria-label="Conversation usage">
            {total}
          </p>
        )}
      </div>
      <div className="messages" role="log" aria-label="Messages">
        {!current && list.length === 0 && (
          <p className="assistant-empty">No Conversations yet.</p>
        )}
        {current?.messages.map((m, i) => (
          <Message
            key={i}
            message={m}
            names={names}
            conversationId={current.id}
            shown={shown}
          />
        ))}
        {streaming !== null && replyText(streaming) !== '' && (
          <Message
            message={{ role: 'assistant', text: replyText(streaming) }}
            names={names}
          />
        )}
        {failure && streaming === null && (
          <article className="message message-system" aria-label="System">
            <p>{FAILURES[failure]}</p>
            <div className="message-actions">
              <button onClick={() => void retry()} disabled={readOnly}>
                Retry
              </button>
              {failure === 'key' && (
                <button onClick={onOpenSettings}>Open Settings</button>
              )}
            </div>
          </article>
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

/**
 * A message; a reply shows the Proposals it made as cards, and ends with a
 * collapsible line saying what it used and cost, which opens to list what
 * the Assistant saw.
 */
function Message({
  message: { role, text, model, usage, interrupted, saw, proposals },
  names,
  conversationId,
  shown,
}: {
  message: Pick<ConversationMessage, 'role' | 'text'> &
    Partial<ConversationMessage>;
  names: Names;
  conversationId?: string;
  /** The Proposal the Author came to see, if any. */
  shown?: string | null;
}) {
  const used = model && usage && (
    <span className="message-usage" aria-label="Usage">
      {describeUsage(model, usage)}
    </span>
  );
  return (
    <article
      className={`message message-${role}`}
      aria-label={role === 'author' ? 'You' : 'Assistant'}
    >
      {text && <div className="message-text">{text}</div>}
      {conversationId &&
        proposals?.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            conversationId={conversationId}
            proposal={proposal}
            highlighted={proposal.id === shown}
          />
        ))}
      {interrupted && <p className="message-note">Interrupted</p>}
      {saw ? (
        <details className="message-saw">
          <summary>What the Assistant saw{used}</summary>
          <ul aria-label="What the Assistant saw">
            {sawList(saw, names.manuscript, names.entries).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      ) : (
        used && <p className="message-used">{used}</p>
      )}
    </article>
  );
}
