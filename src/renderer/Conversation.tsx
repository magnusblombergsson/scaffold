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
  Mode,
} from '../shared/conversation';
import {
  FINDING_LABELS,
  reviewText,
  type Finding,
  type ReviewCommand,
} from '../shared/finding';
import type {
  EntrySummary,
  Manuscript,
  ManuscriptScene,
} from '../shared/project-types';
import { replyText } from '../shared/proposal';
import { describeTotal, describeUsage } from '../shared/usage';
import { proposalCardId, ProposalCard } from './ProposalCard';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';
import { sawList } from './saw-list';

// A Conversation with the Assistant, wherever it is shown: in the Assistant
// panel beside the editor, or in a Mode's room.

/** The Modes the window has so far, in the order it shows them. */
export const WINDOW_MODES = ['writing', 'brainstorm'] as const satisfies Mode[];

/** The Project as it is now, which names what the Assistant saw. */
export type Names = { manuscript: Manuscript; entries: EntrySummary[] };

/**
 * A Proposal the Author asked to see in its Conversation, from an Entry;
 * `count` tells one ask from the next.
 */
export type ShowProposal = {
  conversationId: string;
  proposalId: string;
  count: number;
};

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

function sceneOf(
  sceneId: string,
  manuscript: Manuscript,
): ManuscriptScene | undefined {
  return [
    ...manuscript.chapters.flatMap((c) => c.scenes),
    ...manuscript.unplaced,
  ].find((s) => s.id === sceneId);
}

/**
 * The Conversations of the Project, one of them open, and asking the
 * Assistant in it. A new one starts in `mode` when its first message is
 * sent, which is about the Scene `sceneId`, if any. `show` opens one at a
 * Proposal the Author asked to see. A
 * decision made anywhere shows at once. A failed call is kept as `failure`,
 * for Retry; it isn't in the log.
 */
export function useConversation({
  mode,
  sceneId,
  names,
  active,
  show,
}: {
  mode: Mode;
  sceneId: string | null;
  names: Names;
  /** Whether it is shown; it lists the Conversations anew each time it is. */
  active: boolean;
  show?: ShowProposal | null;
}) {
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
  const currentId = useRef<string | null>(null);
  currentId.current = current?.id ?? null;
  const answering = useRef(false);
  answering.current = streaming !== null;

  useEffect(() => {
    // Others may have started meanwhile, as in another Mode's room.
    if (active) void window.assistant.listConversations().then(setList);
  }, [active]);

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

  async function send() {
    const message = draft.trim();
    if (message === '' || streaming !== null) return;
    await asking(async () => {
      const asked = await showAsked({ text: message });
      setDraft('');
      await showResult(
        asked,
        window.assistant.ask(asked, message, sceneId, onText),
      );
    });
  }

  async function review(command: ReviewCommand) {
    const text = sceneId && reviewText(command, sceneId, names.manuscript);
    if (!sceneId || !text || streaming !== null) return;
    await asking(async () => {
      const asked = await showAsked({ text, command });
      await showResult(
        asked,
        window.assistant.review(asked, command, sceneId, onText),
      );
    });
  }

  /**
   * Shows the Author's message in the Conversation it is asked in, which
   * starts with it if new, while the Assistant answers; resolves with the
   * Conversation's id.
   */
  async function showAsked(
    message: Pick<ConversationMessage, 'text' | 'command'>,
  ): Promise<string> {
    let conversation = current;
    if (!conversation) {
      const started = await window.assistant.startConversation(
        mode,
        titleOf(message.text),
      );
      conversation = { ...started, messages: [] };
      setList((list) => [started, ...list]);
    }
    const authored: ConversationMessage = {
      role: 'author',
      ...message,
      focus: sceneId ? [sceneId] : [],
      at: Date.now(),
    };
    const { messages } = conversation;
    setCurrent({ ...conversation, messages: [...messages, authored] });
    return conversation.id;
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

  return {
    list,
    current,
    draft,
    setDraft,
    streaming,
    error,
    failure,
    shown,
    total,
    resume,
    send,
    review,
    retry,
  };
}

export type ConversationState = ReturnType<typeof useConversation>;

/**
 * The messages of the Conversation open, the reply streaming in, and a failed
 * call with Retry. The Assistant's replies are plain text: nothing here puts
 * them in the Manuscript, though the Author can copy them as any text. A
 * reply's Proposals show as cards in it, where the Author decides them.
 */
export function MessageLog({
  conversation: { current, streaming, failure, shown, retry },
  names,
  empty,
  onOpenSettings,
  onQuote,
}: {
  conversation: ConversationState;
  names: Names;
  /** Said while there is no message to show. */
  empty?: string;
  onOpenSettings(): void;
  onQuote?(sceneId: string, quote: string): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const messagesEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView?.({ block: 'end' });
  }, [current?.messages.length, streaming, failure]);
  useEffect(() => {
    if (shown) {
      document
        .getElementById(proposalCardId(shown))
        ?.scrollIntoView?.({ block: 'center' });
    }
  }, [shown, current]);

  return (
    <div className="messages" role="log" aria-label="Messages">
      {empty && !current && <p className="assistant-empty">{empty}</p>}
      {current?.messages.map((m, i) => (
        <Message
          key={i}
          message={m}
          names={names}
          conversationId={current.id}
          shown={shown}
          onQuote={onQuote}
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
  );
}

/** Where the Author writes the next message; Enter sends it. */
export function Composer({
  conversation: { draft, setDraft, streaming, send },
  placeholder,
}: {
  conversation: ConversationState;
  placeholder: string;
}) {
  const readOnly = useContext(ReadOnlyContext);
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <textarea
        aria-label="Message"
        placeholder={placeholder}
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
  );
}

/**
 * A message; a reply shows the Findings it made as a list, and the Proposals
 * as cards, and ends with a collapsible line saying what it used and cost,
 * which opens to list what the Assistant saw.
 */
function Message({
  message: { role, text, model, usage, interrupted, saw, findings, proposals },
  names,
  conversationId,
  shown,
  onQuote,
}: {
  message: Pick<ConversationMessage, 'role' | 'text'> &
    Partial<ConversationMessage>;
  names: Names;
  conversationId?: string;
  /** The Proposal the Author came to see, if any. */
  shown?: string | null;
  onQuote?(sceneId: string, quote: string): void;
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
      {findings && findings.length > 0 && (
        <ol className="findings" aria-label="Findings">
          {findings.map((finding, i) => (
            <FindingItem
              key={i}
              finding={finding}
              manuscript={names.manuscript}
              onQuote={onQuote}
            />
          ))}
        </ol>
      )}
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

/**
 * One Finding of a Review: its type, comment, quote and question. The quote
 * opens its Scene with it selected, while the Scene is there to open.
 */
function FindingItem({
  finding: { type, comment, quote, sceneId, question },
  manuscript,
  onQuote,
}: {
  finding: Finding;
  manuscript: Manuscript;
  onQuote?(sceneId: string, quote: string): void;
}) {
  const scene = sceneId ? sceneOf(sceneId, manuscript) : undefined;
  return (
    <li className={`finding finding-${type}`}>
      <span className="finding-type">{FINDING_LABELS[type]}</span>
      <p className="finding-comment">{comment}</p>
      {quote &&
        (scene && !scene.missing && onQuote ? (
          <button
            className="finding-quote"
            title={`Show in “${scene.title}”`}
            onClick={() => onQuote(scene.id, quote)}
          >
            <q>{quote}</q>
          </button>
        ) : (
          <q className="finding-quote">{quote}</q>
        ))}
      {question && (
        <p className="finding-question">
          <strong>{question}</strong>
        </p>
      )}
    </li>
  );
}
