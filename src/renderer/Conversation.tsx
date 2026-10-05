import {
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  OPEN_FOCUS,
  type AskResult,
  type AssistantFailure,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type InterviewFocus,
  type Mode,
} from '../shared/conversation';
import {
  FINDING_LABELS,
  reviewText,
  type Finding,
  type ReviewCommand,
} from '../shared/finding';
import { loggedModel } from '../shared/models';
import type {
  EntrySummary,
  Manuscript,
  ManuscriptScene,
} from '../shared/project-types';
import type { Changed } from '../shared/api';
import {
  atMentionAt,
  atMentionOptions,
  completeAtMention,
  type AtMention,
} from './at-mention';
import type { MenuItem } from './Binder';
import { streamingText } from '../shared/proposal';
import { describeTotal, describeUsage } from '../shared/usage';
import { focusLabel } from './interview-focus';
import { proposalCardId, ProposalCard } from './ProposalCard';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';
import { sawList } from './saw-list';

// A Conversation with the Assistant, wherever it is shown: in the Assistant
// panel beside the editor, or in a Mode's room.

/** The Modes the window has so far, in the order it shows them. */
export const WINDOW_MODES = [
  'writing',
  'brainstorm',
  'interview',
] as const satisfies Mode[];

/** The Project as it is now, which names what the Assistant saw. */
export type Names = { manuscript: Manuscript; entries: EntrySummary[] };

/** Runs a structure operation and offers to undo it, as the window does; null when cancelled. */
export type OnChange = (
  operation: () => Promise<Changed | null>,
  message: string,
) => Promise<void>;

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
 * sent, which is about the Scene `sceneId`, if any, or a new Interview
 * about `focus`. `show` opens one at a Proposal the Author asked to see. A
 * decision made anywhere shows at once, and so does a Conversation renamed,
 * moved to Trash or restored, or forked on another computer. A failed call
 * is kept as `failure`, for Retry; it isn't in the log.
 */
export function useConversation({
  mode,
  sceneId,
  names,
  active,
  show,
  focus = OPEN_FOCUS,
  onChange,
}: {
  mode: Mode;
  sceneId: string | null;
  focus?: InterviewFocus;
  names: Names;
  /** Runs moving a Conversation to Trash, offering to undo it. */
  onChange: OnChange;
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
        if (event.type !== 'conversationsChanged') return;
        void window.assistant.listConversations().then((listed) => {
          setList(listed);
          const id = currentId.current;
          if (!id || answering.current) return;
          // The one open went to Trash.
          if (!listed.some((c) => c.id === id)) {
            setCurrent(null);
            return;
          }
          void window.assistant.readConversation(id).then((conversation) => {
            if (currentId.current === conversation.id) setCurrent(conversation);
          });
        });
      }),
    [],
  );

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

  /** Sends the draft, or `text` the Author asked to send instead. */
  async function send(text?: string) {
    const message = (text ?? draft).trim();
    if (message === '' || streaming !== null) return;
    await asking(async () => {
      const asked = await showAsked({ text: message });
      if (text === undefined) setDraft('');
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
   * Sets the open Interview's focus from its next message on; a new one
   * starts with the `focus` given.
   */
  async function changeFocus(next: InterviewFocus) {
    const conversation = current;
    if (!conversation || streaming !== null) return;
    setError(null);
    try {
      await window.assistant.setInterviewFocus(conversation.id, next);
      const changed = await window.assistant.readConversation(conversation.id);
      if (currentId.current === changed.id) setCurrent(changed);
      setList(await window.assistant.listConversations());
    } catch (error) {
      setError(`Can't change the focus: ${(error as Error).message}`);
    }
  }

  /**
   * Shows the Author's message in the Conversation it is asked in, which
   * starts with it if new, while the Assistant answers; resolves with the
   * Conversation's id. A new Interview starts with its focus set.
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
      if (mode === 'interview') {
        await window.assistant.setInterviewFocus(started.id, focus);
        conversation = {
          ...conversation,
          focus,
          focusChanges: [{ focus, at: Date.now(), before: 0 }],
        };
      }
      const listed = conversation;
      setList((list) => [listed, ...list]);
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

  /** Gives a Conversation a new title; the list shows it once main says so. */
  async function rename(id: string, title: string) {
    setError(null);
    try {
      await window.assistant.renameConversation(id, title);
    } catch (error) {
      setError(`Can't rename the Conversation: ${(error as Error).message}`);
    }
  }

  /**
   * Moves a whole Conversation to Trash once the Author confirms it, with
   * Undo offered; single messages can't be deleted.
   */
  async function trash(id: string) {
    const title = list.find((c) => c.id === id)?.title ?? 'Conversation';
    setError(null);
    await onChange(
      () => window.assistant.trashConversation(id),
      `“${title}” moved to Trash`,
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

  // Summarising a long Conversation is a call too, and counts.
  const total = current
    ? describeTotal(
        [
          ...current.messages,
          ...(current.emptyReplies ?? []),
          ...(current.compactions ?? []),
        ].flatMap((m) =>
          m.model && m.usage
            ? [{ model: loggedModel(m.model), usage: m.usage }]
            : [],
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
    changeFocus,
    rename,
    trash,
  };
}

export type ConversationState = ReturnType<typeof useConversation>;

/**
 * What can be done to a listed Conversation: rename it in place, which
 * `startRename` begins, or move it to Trash. Never while the Project is
 * read-only or the Assistant answers.
 */
export function conversationActions(
  { streaming, trash }: ConversationState,
  id: string,
  startRename: () => void,
  readOnly: boolean,
): MenuItem[] {
  const disabled = readOnly || streaming !== null;
  return [
    { label: 'Rename…', run: startRename, disabled },
    { label: 'Move to Trash…', run: () => trash(id), disabled },
  ];
}

/**
 * The messages of the Conversation open, each change of an Interview's focus
 * between them, the reply streaming in, and a failed call with Retry. The
 * Assistant's replies are plain text: nothing here puts
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
        <Fragment key={i}>
          <EmptyReplies conversation={current} before={i} />
          <FocusChanges conversation={current} before={i} names={names} />
          <Message
            message={m}
            names={names}
            conversationId={current.id}
            shown={shown}
            onQuote={onQuote}
          />
        </Fragment>
      ))}
      {current && (
        <>
          <EmptyReplies
            conversation={current}
            before={current.messages.length}
            onRetry={
              streaming === null && !failure ? () => void retry() : undefined
            }
          />
          <FocusChanges
            conversation={current}
            before={current.messages.length}
            names={names}
          />
        </>
      )}
      {streaming !== null && streamingText(streaming) !== '' && (
        <Message
          message={{ role: 'assistant', text: streamingText(streaming) }}
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

/**
 * The replies that came back empty before the message `before`, each with
 * what it used; the last offers `onRetry`, if given.
 */
function EmptyReplies({
  conversation: { emptyReplies = [] },
  before,
  onRetry,
}: {
  conversation: Conversation;
  before: number;
  onRetry?(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const here = emptyReplies.filter((reply) => reply.before === before);
  return here.map(({ model, usage }, i) => (
    <article
      key={i}
      className="message message-assistant"
      aria-label="Assistant"
    >
      <p className="message-note">
        No reply: the Model used its whole length limit thinking. Try again or
        choose another Model.
      </p>
      {onRetry && i === here.length - 1 && (
        <div className="message-actions">
          <button onClick={onRetry} disabled={readOnly}>
            Retry
          </button>
        </div>
      )}
      {usage && (
        <p className="message-used">
          <span className="message-usage" aria-label="Usage">
            {describeUsage(loggedModel(model), usage)}
          </span>
        </p>
      )}
    </article>
  ));
}

/** Where an Interview's focus was set, before the message `before`. */
function FocusChanges({
  conversation: { focusChanges = [] },
  before,
  names,
}: {
  conversation: Conversation;
  before: number;
  names: Names;
}) {
  return focusChanges
    .filter((change) => change.before === before)
    .map((change, i) => (
      <p key={i} className="focus-change" role="note">
        Focus: {focusLabel(change.focus, names)}
      </p>
    ));
}

/**
 * Where the Author writes the next message; Enter sends it. Given the
 * Manuscript, typing @ offers its Chapters and Scenes by title, to bring
 * one into the question.
 */
export function Composer({
  conversation: { draft, setDraft, streaming, send },
  placeholder,
  manuscript,
}: {
  conversation: ConversationState;
  placeholder: string;
  manuscript?: Manuscript;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [mention, setMention] = useState<AtMention | null>(null);
  /** The @ the list is closed for, by where it is: dismissed, or completed. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  /** Where the cursor goes once the draft holds a completed mention. */
  const cursor = useRef<number | null>(null);

  const options =
    manuscript && mention && mention.from !== dismissed
      ? atMentionOptions(mention.query, manuscript)
      : [];
  const listed = options.length > 0;
  /** The option Enter picks; the list may have shrunk under it. */
  const current = Math.min(active, options.length - 1);

  useLayoutEffect(() => {
    const at = cursor.current;
    if (at === null || !textarea.current) return;
    cursor.current = null;
    textarea.current.setSelectionRange(at, at);
  }, [draft]);

  /** Follows the cursor into and out of an @-mention. */
  function track(element: HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = element;
    const next =
      selectionStart === selectionEnd
        ? atMentionAt(value, selectionStart)
        : null;
    if (next?.from !== mention?.from) {
      setActive(0);
      setDismissed(null);
    }
    setMention(next);
  }

  function choose(title: string) {
    if (!mention) return;
    const completed = completeAtMention(draft, mention, title);
    cursor.current = completed.cursor;
    setDraft(completed.text);
    // Enter now sends, even should a longer title start the same way.
    setDismissed(mention.from);
    textarea.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while an input method composes a word is the method's.
    if (event.nativeEvent.isComposing) return;
    if (listed) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current + step + options.length) % options.length);
        return;
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault();
        choose(options[current].title);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(mention?.from ?? null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }
  const optionId = (index: number) => `${listId}-${index}`;
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <textarea
        ref={textarea}
        aria-label="Message"
        aria-autocomplete={manuscript ? 'list' : undefined}
        aria-controls={listed ? listId : undefined}
        aria-activedescendant={listed ? optionId(current) : undefined}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          track(event.target);
        }}
        onSelect={(event) => track(event.currentTarget)}
        onBlur={() => setMention(null)}
        onKeyDown={onKeyDown}
        disabled={readOnly}
        rows={3}
      />
      {listed && (
        <ul
          id={listId}
          className="at-mention-options"
          role="listbox"
          aria-label="Chapters and Scenes"
        >
          {options.map((option, i) => (
            <li
              key={option.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              // The textarea keeps the focus, and with it the cursor.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option.title);
              }}
            >
              <span className="at-mention-title">{option.title}</span>{' '}
              <span className="at-mention-where">{option.where}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        className="primary"
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
  message,
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
  const { role, text, model, usage, interrupted, unreadable } = message;
  const { cutShort, saw, findings, proposals } = message;
  const used = model && usage && (
    <span className="message-usage" aria-label="Usage">
      {describeUsage(loggedModel(model), usage)}
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
      {interrupted && (
        <p className="message-note">
          {cutShort
            ? 'Cut short: the reply reached its length limit'
            : 'Interrupted'}
        </p>
      )}
      {unreadable && (
        <p className="message-note">
          {unreadable === 1
            ? '1 Proposal couldn’t be read'
            : `${unreadable} Proposals couldn’t be read`}
        </p>
      )}
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
