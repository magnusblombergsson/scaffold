import {
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  OPEN_FOCUS,
  PLAN_ASK_LABELS,
  type AskResult,
  type AssistantFailure,
  type BringIn,
  broughtInNow,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type InterviewFocus,
  type Mode,
  type PlanAsk,
} from '../shared/conversation';
import {
  FINDING_LABELS,
  PLAN_FINDING_LABELS,
  reviewedUnit,
  reviewText,
  type Finding,
  type PlanFinding,
  type ReviewCommand,
} from '../shared/finding';
import { conversationBook } from '../shared/manuscript-order';
import { loggedModel, type Model } from '../shared/models';
import type { TodoLink } from '../shared/todo';
import { manuscriptUnit } from '../shared/unit-name';
import type {
  EntrySummary,
  Manuscript,
  ManuscriptScene,
} from '../shared/project-types';
import type { CallFailure } from '../shared/api';
import type { RequestSize } from '../shared/request-size';
import {
  atMentionAt,
  atMentionOptions,
  completeAtMention,
  type AtMention,
} from './at-mention';
import type { MenuItem } from './Binder';
import { streamingText } from '../shared/reply';
import {
  describeTotal,
  describeUsage,
  roughTokens,
  type MeteredTurn,
  type Total,
} from '../shared/usage';
import { focusLabel } from './interview-focus';
import { planFocusLabel } from './plan-focus';
import type { ProposalView } from '../shared/proposal';
import { proposalCardId, ProposalCard } from './ProposalCard';
import { modelName } from './model-listing';
import { emptyReplyNote } from './empty-reply-note';
import {
  failureMessage,
  tooBigMessage,
  type TooBigMessage,
} from './provider-messages';
import { NO_SHORTLISTS, useProviders, useShortlists } from './Providers';
import { ReadOnlyContext } from './read-only';
import { ReplyInlineText, ReplyText } from './ReplyText';
import { sawList } from './saw-list';
import {
  composerBounds,
  ComposerHeightContext,
  useComposerMeasures,
} from './composer-height';
import { PanelResizer } from './PanelResizer';
import { useMirror, useRun } from './use-project';

// A Conversation with the Assistant, wherever it is shown: in the Assistant
// panel beside the editor, or in a Mode's room.

/** The Modes the window has so far, in the order it shows them. */
export const WINDOW_MODES = [
  'writing',
  'brainstorm',
  'interview',
  'plan',
] as const satisfies Mode[];

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

/** Names the Model a turn was logged with, as the Author knows it. */
type Named = (model: string, provider?: Model['provider']) => string;

/** The longest title a Conversation gets from its first message. */
const TITLE_LENGTH = 60;

/** A Conversation's title, from the first line of its first message. */
function titleOf(message: string): string {
  const line = message.trim().split('\n')[0].trim();
  return line.length > TITLE_LENGTH
    ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
    : line;
}

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
 * or Plan about `focus`. `show` opens one at a Proposal the Author asked to see. A
 * decision made anywhere shows at once, and so does a Conversation renamed,
 * moved to Trash or restored, or forked on another computer. A failed call
 * is kept as `failure`, with the Model it asked, for Retry; it isn't in the
 * log. A Conversation is on its `model`, which a new one starts on: the one
 * chosen last, unless the Author chooses another before sending. In a
 * Series, a Brainstorm or Interview is about its `book`, which a new one
 * starts on: the `book` given, unless the Author chooses another first.
 */
export function useConversation({
  mode,
  sceneId,
  names,
  active,
  show,
  focus = OPEN_FOCUS,
  book: startingBook,
}: {
  mode: Mode;
  sceneId: string | null;
  focus?: InterviewFocus;
  /** In a Series, the Book a new Brainstorm or Interview is about, by id. */
  book?: string;
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
  /**
   * Why the last call failed, and on which Model, until the Author asks
   * again; for a Plan's request too big for its Model, what it is made of.
   */
  const [failure, setFailure] = useState<{
    kind: AssistantFailure;
    model: Model;
    tooBig?: RequestSize;
  } | null>(null);
  /** The Model a new Conversation starts on unless the Author chooses. */
  const [defaultModel, setDefaultModel] = useState<Model>();
  /** The Model the Author chose for a new Conversation, before it starts. */
  const [newModel, setNewModel] = useState<Model>();
  /** Whether the Model dropdown is open. */
  const [picking, setPicking] = useState(false);
  /** The Book the Author chose for a new Conversation, before it starts. */
  const [newBook, setNewBook] = useState<string>();
  /**
   * In a Series, the Book a Brainstorm or Interview is about, as main sends
   * it; none in Writing, which is about the Book of the Scene in focus.
   */
  const book =
    mode === 'writing'
      ? undefined
      : conversationBook(
          names.manuscript,
          current ? current.book : (newBook ?? startingBook),
        );
  const providers = useProviders();
  /** One that never had a Model chosen nor a reply is asked as a new one is. */
  const model = current
    ? (current.model ?? defaultModel)
    : (newModel ?? defaultModel);
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

  // Asked anew whenever another Conversation may have been put on a Model,
  // or the shortlists changed.
  const opened = current?.id ?? null;
  useEffect(() => {
    if (!active) return;
    let live = true;
    void window.settings.defaultModel().then((model) => {
      if (live) setDefaultModel(model);
    });
    return () => {
      live = false;
    };
  }, [active, opened, providers]);

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

  const mirror = useMirror();
  const run = useRun();
  useEffect(
    () =>
      mirror.onEvent((event) => {
        // A Proposal was decided, or its Entry changed: show where each stands now.
        const id = currentId.current;
        if (event.type !== 'proposalsChanged' || !id || answering.current) {
          return;
        }
        void window.assistant.readConversation(id).then((conversation) => {
          if (currentId.current === conversation.id) setCurrent(conversation);
        });
      }),
    [mirror],
  );

  useEffect(() => {
    if (!show || answering.current) return;
    void resume(show.conversationId).then(() => setShown(show.proposalId));
  }, [show]);

  async function resume(id: string) {
    setError(null);
    setFailure(null);
    setShown(null);
    setNewModel(undefined);
    setNewBook(undefined);
    setPicking(false);
    if (id === '') {
      setCurrent(null);
      return;
    }
    try {
      setCurrent(await window.assistant.readConversation(id));
    } catch (error) {
      setError(
        `Can't open the Conversation: ${(error as CallFailure).message}`,
      );
    }
  }

  /**
   * Shows a new Conversation, not yet started, about the Book `book` in a
   * Series; none while a reply streams in.
   */
  function startNew(book?: string) {
    if (answering.current) return;
    void resume('');
    setNewBook(book);
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
   * Sends what a Plan start button asks, its label as the Author's message;
   * a new Plan starts with it.
   */
  async function planAsk(ask: PlanAsk) {
    if (streaming !== null) return;
    const text = PLAN_ASK_LABELS[ask];
    await asking(async () => {
      const asked = await showAsked({ text, ask });
      await showResult(asked, window.assistant.planAsk(asked, ask, onText));
    });
  }

  /**
   * Sets the open Interview's or Plan's focus from its next message on; a
   * new one starts with the `focus` given.
   */
  async function changeFocus(next: InterviewFocus) {
    const conversation = current;
    if (!conversation || streaming !== null) return;
    setError(null);
    await run(
      async () => {
        await window.assistant.setInterviewFocus(conversation.id, next);
        const changed = await window.assistant.readConversation(
          conversation.id,
        );
        if (currentId.current === changed.id) setCurrent(changed);
        setList(await window.assistant.listConversations());
      },
      { what: 'change the focus' },
    );
  }

  /**
   * Shows the Author's message in the Conversation it is asked in, which
   * starts with it if new, while the Assistant answers; resolves with the
   * Conversation's id. A new Interview or Plan starts with its focus set,
   * and in a Series, a new Brainstorm, Interview or Plan on its Book.
   */
  async function showAsked(
    message: Pick<ConversationMessage, 'text' | 'command' | 'ask'>,
  ): Promise<string> {
    const conversation = current ?? (await start(titleOf(message.text)));
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

  /**
   * Starts the new Conversation shown, titled `title`, on its Model: an
   * Interview or Plan with its focus set, and in a Series, a Brainstorm,
   * Interview or Plan on its Book.
   */
  async function start(title: string): Promise<Conversation> {
    if (!model) throw new Error('There is no Model to ask');
    const started = await window.assistant.startConversation(
      mode,
      title,
      model,
    );
    setNewModel(undefined);
    setNewBook(undefined);
    let conversation: Conversation = { ...started, model, messages: [] };
    if (book !== undefined) {
      await window.assistant.chooseBook(started.id, book);
      conversation = { ...conversation, book };
    }
    if (mode === 'interview' || mode === 'plan') {
      await window.assistant.setInterviewFocus(started.id, focus);
      conversation = {
        ...conversation,
        focus,
        focusChanges: [{ focus, at: Date.now(), before: 0 }],
      };
    }
    const listed = conversation;
    setList((list) => [listed, ...list]);
    return conversation;
  }

  /**
   * Brings a Brainstorm into the open Plan, or the rest of it; a new Plan
   * starts with it, titled after it.
   */
  async function bringIn(brainstorm: { id: string; title: string }) {
    if (streaming !== null) return;
    setError(null);
    await run(
      async () => {
        const plan =
          current ?? (await start(`Plan from “${brainstorm.title}”`));
        await window.assistant.bringIn(plan.id, brainstorm.id);
        setCurrent(await window.assistant.readConversation(plan.id));
      },
      { what: 'bring in the Brainstorm' },
    );
  }

  /** Removes a Brainstorm brought into the open Plan: it is sent no more. */
  async function removeBroughtIn(brainstormId: string) {
    const conversation = current;
    if (!conversation || streaming !== null) return;
    setError(null);
    await run(
      async () => {
        await window.assistant.removeBroughtIn(conversation.id, brainstormId);
        const changed = await window.assistant.readConversation(
          conversation.id,
        );
        if (currentId.current === changed.id) setCurrent(changed);
      },
      { what: 'remove the Brainstorm' },
    );
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

  /**
   * Puts the open Conversation on `next` from its next message on, or a new
   * one, once it starts.
   */
  async function chooseModel(next: Model) {
    const conversation = current;
    if (streaming !== null) return;
    setError(null);
    if (!conversation) {
      setNewModel(next);
      return;
    }
    await run(
      async () => {
        await window.assistant.chooseModel(conversation.id, next);
        const changed = await window.assistant.readConversation(
          conversation.id,
        );
        if (currentId.current === changed.id) setCurrent(changed);
      },
      { what: 'change the Model' },
    );
  }

  /**
   * Puts the open Brainstorm or Interview on the Book `next` from its next
   * message on, or a new one, once it starts.
   */
  async function chooseBook(next: string) {
    const conversation = current;
    if (streaming !== null) return;
    setError(null);
    if (!conversation) {
      setNewBook(next);
      return;
    }
    await run(
      async () => {
        await window.assistant.chooseBook(conversation.id, next);
        const changed = await window.assistant.readConversation(
          conversation.id,
        );
        if (currentId.current === changed.id) setCurrent(changed);
        setList(await window.assistant.listConversations());
      },
      { what: 'change the Book' },
    );
  }

  /** Gives a Conversation a new title; the list shows it once main says so. */
  async function rename(id: string, title: string) {
    setError(null);
    await run(() => window.assistant.renameConversation(id, title), {
      what: 'rename the Conversation',
    });
  }

  /** Stars or unstars a Conversation; the list shows it once main says so. */
  async function star(id: string, starred: boolean) {
    setError(null);
    await run(() => window.assistant.starConversation(id, starred), {
      what: `${starred ? 'star' : 'unstar'} the Conversation`,
    });
  }

  /**
   * Moves a whole Conversation to Trash once the Author confirms it, with
   * Undo offered; single messages can't be deleted.
   */
  async function trash(id: string) {
    const title = list.find((c) => c.id === id)?.title ?? 'Conversation';
    setError(null);
    await run(() => window.assistant.trashConversation(id), {
      undo: `“${title}” moved to Trash`,
    });
  }

  /** Moves a whole Conversation to the Drawer, its pending Proposals with it, with Undo offered. */
  async function toDrawer(id: string) {
    const title = list.find((c) => c.id === id)?.title ?? 'Conversation';
    setError(null);
    await run((project) => project.moveToDrawer('conversation', id), {
      undo: `“${title}” moved to the Drawer`,
    });
  }

  /** Runs `ask` while the Assistant answers, its reply streaming in meanwhile. */
  async function asking(ask: () => Promise<void>) {
    setError(null);
    setFailure(null);
    setStreaming('');
    // What the Author typed last reaches main before the request is built.
    await run(ask, { what: 'ask the Assistant' });
    setStreaming(null);
  }

  function onText(text: string) {
    setStreaming((so) => (so ?? '') + text);
  }

  /** Shows the Conversation as logged once the call is over, and how it went. */
  async function showResult(id: string, result: Promise<AskResult>) {
    const asked = model;
    const { failure, tooBig } = await result;
    // The log, not this window, says what was sent and when.
    const logged = await window.assistant.readConversation(id);
    setCurrent(logged);
    const on = logged.model ?? asked;
    setFailure(
      failure && on
        ? { kind: failure, model: on, ...(tooBig && { tooBig }) }
        : null,
    );
  }

  // Summarising a long Conversation is a call too, and counts, even when
  // the summary wasn't used. A turn with no usage counts too, as one whose
  // price isn't known.
  const total = current
    ? describeTotal(
        [
          ...current.messages,
          ...(current.emptyReplies ?? []),
          ...(current.compactions ?? []),
          ...(current.unusedSummaries ?? []),
        ].flatMap((m) =>
          m.model ? [meteredTurn({ ...m, model: m.model })] : [],
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
    model,
    chooseModel,
    book,
    chooseBook,
    picking,
    setPicking,
    resume,
    startNew,
    send,
    review,
    planAsk,
    retry,
    changeFocus,
    bringIn,
    removeBroughtIn,
    rename,
    star,
    trash,
    toDrawer,
  };
}

export type ConversationState = ReturnType<typeof useConversation>;

/**
 * What can be done to a listed Conversation: rename it in place, which
 * `startRename` begins, star or unstar it, or move it to Trash or the
 * Drawer. Never while
 * the Project is read-only, nor, but for the star, which isn't in its log,
 * while the Assistant answers.
 */
export function conversationActions(
  { list, streaming, star, trash, toDrawer }: ConversationState,
  id: string,
  startRename: () => void,
  readOnly: boolean,
): MenuItem[] {
  const disabled = readOnly || streaming !== null;
  const starred = list.find((c) => c.id === id)?.starred === true;
  return [
    { label: 'Rename…', run: startRename, disabled },
    {
      label: starred ? 'Unstar' : 'Star',
      run: () => void star(id, !starred),
      disabled: readOnly,
    },
    { label: 'Move to Trash…', run: () => trash(id), disabled },
    { label: 'Move to Drawer', run: () => toDrawer(id), disabled },
  ];
}

/**
 * The messages of the Conversation open, each change of an Interview's focus
 * between them, the reply streaming in, and a failed call with why, naming
 * its Provider, with Retry and a switch to another Model. Each reply names
 * the Model that wrote it. The Assistant's replies show their bold, italic
 * and lists, and the rest of their Markdown as typed; the Author's messages
 * show as typed. Nothing here puts a reply in the Manuscript, though the
 * Author can copy it as any text. A reply's Proposals show as cards in it,
 * where the Author decides them.
 */
export function MessageLog({
  conversation: {
    current,
    streaming,
    failure,
    shown,
    retry,
    setPicking,
    removeBroughtIn,
  },
  names,
  empty,
  onOpenSettings,
  onQuote,
  onAddTodo,
  onShowUnit,
  proposals: showProposals,
}: {
  conversation: ConversationState;
  names: Names;
  /** Said while there is no message to show. */
  empty?: ReactNode;
  onOpenSettings(): void;
  onQuote?(sceneId: string, quote: string): void;
  /**
   * Starts a Todo from a Finding: its text, linked to the unit reviewed, or
   * the first a Plan check's names.
   */
  onAddTodo?(text: string, link: TodoLink | null): void;
  /** Shows a unit a Plan check's Finding names. */
  onShowUnit?(id: string): void;
  /** How a reply's Proposals show, if not as cards in it. */
  proposals?(proposals: ProposalView[]): ReactNode;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const providers = useProviders();
  const shortlists = useShortlists();
  /** What names a Model in this log: its shortlist, as it is now. */
  const named = (model: string, provider?: Model['provider']) =>
    modelName(loggedModel(model, provider), shortlists ?? NO_SHORTLISTS);
  /** Removes a Brainstorm brought in, but not while a reply streams in. */
  const remove =
    streaming === null ? (id: string) => void removeBroughtIn(id) : undefined;
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
      {empty &&
        !current?.messages.length &&
        (typeof empty === 'string' ? (
          <p className="assistant-empty">{empty}</p>
        ) : (
          empty
        ))}
      {current?.messages.map((m, i) => (
        <Fragment key={i}>
          <EmptyReplies conversation={current} before={i} named={named} />
          <FocusChanges conversation={current} before={i} names={names} />
          <BringIns conversation={current} before={i} onRemove={remove} />
          <Message
            message={m}
            names={names}
            named={named}
            conversationId={current.id}
            shown={shown}
            onQuote={onQuote}
            onShowUnit={onShowUnit}
            showProposals={showProposals}
            onAddTodo={onAddTodo}
            reviewed={
              m.findings
                ? reviewedUnit(current.messages, i, names.manuscript)
                : null
            }
          />
        </Fragment>
      ))}
      {current && (
        <>
          <EmptyReplies
            conversation={current}
            before={current.messages.length}
            named={named}
            onRetry={
              streaming === null && !failure ? () => void retry() : undefined
            }
          />
          <FocusChanges
            conversation={current}
            before={current.messages.length}
            names={names}
          />
          <BringIns
            conversation={current}
            before={current.messages.length}
            onRemove={remove}
          />
        </>
      )}
      {streaming !== null && streamingText(streaming) !== '' && (
        <Message
          message={{ role: 'assistant', text: streamingText(streaming) }}
          names={names}
          named={named}
        />
      )}
      {failure && streaming === null && (
        <article className="message message-system" aria-label="System">
          {failure.tooBig ? (
            <TooBig
              message={tooBigMessage(
                failure.tooBig,
                failure.model,
                named(failure.model.id, failure.model.provider),
              )}
            />
          ) : (
            <p>
              {providers &&
                failureMessage(failure.kind, failure.model, providers)}
            </p>
          )}
          <div className="message-actions">
            <button onClick={() => void retry()} disabled={readOnly}>
              Retry
            </button>
            <button onClick={() => setPicking(true)} disabled={readOnly}>
              Choose another Model
            </button>
            {(failure.kind === 'key' ||
              !providers?.providers[failure.model.provider].added) && (
              <button onClick={onOpenSettings}>Open Settings</button>
            )}
          </div>
        </article>
      )}
      <div ref={messagesEnd} />
    </div>
  );
}

/** Why a request wasn't answered: too big for its Model, what is biggest in it, and the ways out. */
function TooBig({ message }: { message: TooBigMessage }) {
  return (
    <>
      <p>{message.lead}</p>
      <ul className="too-big-parts">
        {message.parts.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ul>
      {message.after.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}

/**
 * The replies that came back empty, or failed before any text, before
 * the message `before`, each with what it used; the last offers `onRetry`,
 * if given.
 */
function EmptyReplies({
  conversation: { emptyReplies = [] },
  before,
  named,
  onRetry,
}: {
  conversation: Conversation;
  before: number;
  named: Named;
  onRetry?(): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const here = emptyReplies.filter((reply) => reply.before === before);
  return here.map((reply, i) => (
    <article
      key={i}
      className="message message-assistant"
      aria-label="Assistant"
    >
      <p className="message-note">{emptyReplyNote(reply.reason)}</p>
      {onRetry && i === here.length - 1 && (
        <div className="message-actions">
          <button onClick={onRetry} disabled={readOnly}>
            Retry
          </button>
        </div>
      )}
      <p className="message-used">
        <span className="message-model" aria-label="Model">
          {named(reply.model, reply.provider)}
        </span>
        <UsageLine turn={reply} />
      </p>
    </article>
  ));
}

/** Where an Interview's or Plan's focus was set, before the message `before`. */
function FocusChanges({
  conversation: { focusChanges = [], mode, book },
  before,
  names,
}: {
  conversation: Conversation;
  before: number;
  names: Names;
}) {
  const { manuscript } = names;
  const label = (focus: InterviewFocus) =>
    mode === 'plan'
      ? planFocusLabel(focus, manuscript, conversationBook(manuscript, book))
      : focusLabel(focus, names);
  return focusChanges
    .filter((change) => change.before === before)
    .map((change, i) => (
      <p key={i} className="focus-change" role="note">
        Focus: {label(change.focus)}
      </p>
    ));
}

/** Why a Brainstorm brought in isn't sent, as its marker says. */
const NOT_SENT: Record<NonNullable<BringIn['notSent']>, string> = {
  trash: 'it is in Trash',
  drawer: 'it is in the Drawer',
  'other-book': 'it is about another Book',
  gone: 'it is no longer in the Project',
};

/**
 * Where a Plan brought a Brainstorm in, with the size it brought and, with
 * others in, the total, or removed one, before the message `before`. The
 * latest of one still brought in says why it isn't sent, if it isn't, and
 * offers `onRemove` when given.
 */
function BringIns({
  conversation: { bringIns = [] },
  before,
  onRemove,
}: {
  conversation: Conversation;
  before: number;
  onRemove?(brainstormId: string): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const now = new Set<BringIn>(broughtInNow(bringIns));
  return bringIns
    .filter((bringIn) => bringIn.before === before)
    .map((bringIn, i) => (
      <p key={i} className="focus-change bring-in" role="note">
        {bringIn.removed ? 'Removed: ' : 'Brought in: '}
        <em>{bringIn.title}</em>
        {!bringIn.removed && (
          <>
            {' · '}
            {roughTokens(bringIn.size)}
            {bringIn.total > bringIn.size &&
              ` (${roughTokens(bringIn.total)} in all)`}
          </>
        )}
        {bringIn.notSent && (
          <span className="bring-in-unsent">
            {' · Not sent: '}
            {NOT_SENT[bringIn.notSent]}
          </span>
        )}
        {onRemove && now.has(bringIn) && (
          <button
            className="bring-in-remove"
            onClick={() => onRemove(bringIn.conversation)}
            disabled={readOnly}
          >
            Remove
          </button>
        )}
      </p>
    ));
}

/**
 * Where the Author writes the next message; Enter sends it. Given the
 * Manuscript, typing @ offers its Chapters and Scenes by title, to bring
 * one into the question. Its box grows with the text, and a bar along its
 * top makes it taller, one height for every composer.
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
  const form = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { dragged, onDrag } = useContext(ComposerHeightContext);
  const { threeRows, pane } = useComposerMeasures(form, textarea);
  const { min, max, dragMax } = composerBounds({ dragged, threeRows, pane });
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
      ref={form}
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <PanelResizer
        label="Message box height"
        className="composer-grab"
        panel="below"
        size={min}
        min={threeRows}
        max={dragMax}
        onResize={(height) => onDrag(height, false)}
        onResized={(height) => onDrag(height)}
        onReset={() => onDrag(null)}
      />
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
        style={threeRows ? { minHeight: min, maxHeight: max } : undefined}
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
 * What a Conversation's turns used and cost so far; on hover, how many have
 * no price when some haven't.
 */
export function ConversationUsage({ total }: { total: Total | null }) {
  return (
    total && (
      <p
        className="conversation-usage"
        aria-label="Conversation usage"
        title={total.hover}
      >
        {total.text}
      </p>
    )
  );
}

/** What the log holds of a turn's cost: a message, empty reply or summary. */
type LoggedTurn = Pick<ConversationMessage, 'provider' | 'usage' | 'cost'> & {
  model: string;
};

/** A turn as far as its cost goes, from what the log holds of it. */
function meteredTurn({
  model,
  provider,
  usage,
  cost,
}: LoggedTurn): MeteredTurn {
  return {
    model: loggedModel(model, provider),
    ...(usage && { usage }),
    ...(cost !== undefined && { cost }),
  };
}

/** What a turn used and cost, when anything of it is known. */
function UsageLine({ turn }: { turn: LoggedTurn }) {
  const described = describeUsage(meteredTurn(turn));
  return (
    described && (
      <span className="message-usage" aria-label="Usage">
        {described}
      </span>
    )
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
  named,
  conversationId,
  shown,
  onQuote,
  onAddTodo,
  reviewed,
  onShowUnit,
  showProposals,
}: {
  message: Pick<ConversationMessage, 'role' | 'text'> &
    Partial<ConversationMessage>;
  names: Names;
  named: Named;
  conversationId?: string;
  /** The Proposal the Author came to see, if any. */
  shown?: string | null;
  onQuote?(sceneId: string, quote: string): void;
  /** Starts a Todo of a Finding's text, linked to `link`. */
  onAddTodo?(text: string, link: TodoLink | null): void;
  /** The unit a Review's Findings link a Todo to, if any. */
  reviewed?: TodoLink | null;
  /** Shows a unit a Plan check's Finding names. */
  onShowUnit?(id: string): void;
  /** How its Proposals show, if not as cards. */
  showProposals?(proposals: ProposalView[]): ReactNode;
}) {
  const { role, text, model, provider, interrupted, unreadable } = message;
  const { cutShort, saw, findings, planFindings, proposals } = message;
  const used = model && (
    <>
      <span className="message-model" aria-label="Model">
        {named(model, provider)}
      </span>
      <UsageLine turn={{ ...message, model }} />
    </>
  );
  return (
    <article
      className={`message message-${role}`}
      aria-label={role === 'author' ? 'You' : 'Assistant'}
    >
      {text &&
        (role === 'assistant' ? (
          <ReplyText text={text} />
        ) : (
          <div className="message-text">{text}</div>
        ))}
      {findings && findings.length > 0 && (
        <ol className="findings" aria-label="Findings">
          {findings.map((finding, i) => (
            <FindingItem
              key={i}
              finding={finding}
              manuscript={names.manuscript}
              onQuote={onQuote}
              onAddTodo={
                onAddTodo && ((text) => onAddTodo(text, reviewed ?? null))
              }
            />
          ))}
        </ol>
      )}
      {planFindings && planFindings.length > 0 && (
        <ol className="findings" aria-label="Findings">
          {planFindings.map((finding, i) => (
            <PlanFindingItem
              key={i}
              finding={finding}
              manuscript={names.manuscript}
              onShowUnit={onShowUnit}
              onAddTodo={onAddTodo}
            />
          ))}
        </ol>
      )}
      {conversationId &&
        showProposals &&
        proposals &&
        proposals.length > 0 &&
        showProposals(proposals)}
      {conversationId &&
        !showProposals &&
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
 * opens its Scene with it selected, while the Scene is there to open. Add as
 * Todo starts a Todo of its comment.
 */
function FindingItem({
  finding: { type, comment, quote, sceneId, question },
  manuscript,
  onQuote,
  onAddTodo,
}: {
  finding: Finding;
  manuscript: Manuscript;
  onQuote?(sceneId: string, quote: string): void;
  onAddTodo?(text: string): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const scene = sceneId ? sceneOf(sceneId, manuscript) : undefined;
  return (
    <li className={`finding finding-${type}`}>
      <span className="finding-type">{FINDING_LABELS[type]}</span>
      <p className="finding-comment">
        <ReplyInlineText text={comment} />
      </p>
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
          <strong>
            <ReplyInlineText text={question} />
          </strong>
        </p>
      )}
      {onAddTodo && (
        <button
          className="finding-todo"
          disabled={readOnly}
          onClick={() => onAddTodo(comment)}
        >
          Add as Todo
        </button>
      )}
    </li>
  );
}

/**
 * One Finding of a Plan check: its kind, the units it names, its comment,
 * quote and question. Each unit still in the Manuscript shows it in the
 * plan. Add as Todo starts a Todo of its comment, linked to the first.
 */
function PlanFindingItem({
  finding: { kind, units, comment, quote, question },
  manuscript,
  onShowUnit,
  onAddTodo,
}: {
  finding: PlanFinding;
  manuscript: Manuscript;
  onShowUnit?(id: string): void;
  onAddTodo?(text: string, link: TodoLink | null): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const named = units.flatMap((id) => manuscriptUnit(id, manuscript) ?? []);
  return (
    <li className={`finding plan-finding-${kind}`}>
      <span className="finding-type">{PLAN_FINDING_LABELS[kind]}</span>
      {named.length > 0 && (
        <ul className="finding-units" aria-label="Units">
          {named.map((unit) => (
            <li key={unit.id}>
              {onShowUnit ? (
                <button
                  className="link-button"
                  title={`Show “${unit.title}” in the plan`}
                  onClick={() => onShowUnit(unit.id)}
                >
                  {unit.title}
                </button>
              ) : (
                unit.title
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="finding-comment">
        <ReplyInlineText text={comment} />
      </p>
      {quote && <q className="finding-quote">{quote}</q>}
      {question && (
        <p className="finding-question">
          <strong>
            <ReplyInlineText text={question} />
          </strong>
        </p>
      )}
      {onAddTodo && (
        <button
          className="finding-todo"
          disabled={readOnly}
          onClick={() =>
            onAddTodo(
              comment,
              named[0] ? { kind: named[0].kind, id: named[0].id } : null,
            )
          }
        >
          Add as Todo
        </button>
      )}
    </li>
  );
}
