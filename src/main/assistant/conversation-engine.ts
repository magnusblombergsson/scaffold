import { dayOf } from '../../shared/entry';
import {
  broughtInNow,
  focusIds,
  OPEN_FOCUS,
  PLAN_ASK_LABELS,
  type PlanAsk,
  type AskResult,
  type BringInChoice,
  type Compaction,
  type Conversation,
  type ConversationMessage,
  type EmptyReply,
  type Saw,
  type UnusedSummary,
} from '../../shared/conversation';
import {
  findingOf,
  inOrder,
  planFindingOf,
  quotedIn,
  reviewText,
  type Finding,
  type PlanFinding,
  type ReviewCommand,
} from '../../shared/finding';
import type { Model, ModelWindow } from '../../shared/models';
import {
  pastWindow,
  replyRoom,
  tokens,
  type KnownWindow,
  type MeasuredSize,
  type RequestSize,
} from '../../shared/request-size';
import { conversationBook } from '../../shared/manuscript-order';
import { unitText } from '../../shared/project-types';
import type { Clock } from '../project-store/clock';
import type { ProjectStore } from '../project-store/project-store';
import {
  compactionFor,
  compactionPoint,
  summaryRequest,
  type CompactionPolicy,
} from './compaction';
import {
  broughtInText,
  buildContext,
  defaultRequest,
  isOutlined,
  planUnitIds,
  readableScene,
  storyBibleOf,
} from './context-builder';
import { readOrNot, type LinkedPage } from './linked-pages';
import type { ProviderFor, ProviderRequest } from './provider';
import { readProposals } from './proposal-blocks';
import { finishedCall } from './reply-finishing';

/** What a message is about: the Scene open in the editor when it was sent, if any. */
export type Focus = { sceneId: string | null };

export type EngineDeps = {
  store: Pick<
    ProjectStore,
    | 'flush'
    | 'assistantView'
    | 'readConversation'
    | 'appendMessage'
    | 'appendEmptyReply'
    | 'appendProposal'
    | 'appendSummary'
    | 'appendUnusedSummary'
    | 'bringInCandidates'
    | 'broughtInBrainstorms'
    | 'bringIn'
  >;
  /** The Provider each Model is reached through. */
  providerFor: ProviderFor;
  /** The Model asked in a Conversation that isn't on one yet. */
  defaultModel: () => Model;
  clock: Clock;
  /** When a long Conversation is compacted, else as the chosen Model's window says; tests make it short. */
  compaction?: CompactionPolicy;
  /** A Model's window as its listing says, if it is listed; without it, nothing is measured. */
  windowOf?: (model: Model) => ModelWindow | null;
  /** The pages linked in a Research message, read just now; without it, none are read. */
  readPages?: (message: string) => Promise<LinkedPage[]>;
};

/**
 * The Conversation engine: it turns the Author's message into a request,
 * streams the reply, and appends both to the Conversation's log, with the
 * Proposals the reply makes.
 */
export function createConversationEngine({
  store,
  providerFor,
  defaultModel,
  clock,
  compaction,
  windowOf = () => null,
  readPages,
}: EngineDeps) {
  /**
   * The window a request on `model` is measured against (spec: Outline
   * planner §9), or null when it is unknown or unreliable: LM Studio may
   * report more than the Model is loaded with.
   */
  function measuredWindow(model: Model): KnownWindow | null {
    if (model.provider === 'lmstudio') return null;
    const window = windowOf(model);
    return window?.contextWindow != null
      ? { ...window, contextWindow: window.contextWindow }
      : null;
  }

  /** A request of `size` as the Author is told of it: with `window`, if known, and the room for the reply in it. */
  function againstWindow(
    size: MeasuredSize,
    window: KnownWindow | null,
  ): RequestSize {
    return {
      ...size,
      window: window?.contextWindow ?? null,
      reply: window ? replyRoom(window) : 0,
    };
  }

  /**
   * What a message is about, as it logs it: in a Writing Conversation, the
   * Scene open, if the Assistant can read it; in an Interview, the Entry,
   * Chapter or Scene in focus, if any, and in a Plan, the Part or Chapter.
   */
  function focusOf(
    { mode, focus }: Pick<Conversation, 'mode' | 'focus'>,
    sceneId: string | null,
  ): string[] {
    if (mode === 'interview' || mode === 'plan') {
      return focusIds(focus ?? OPEN_FOCUS);
    }
    if (mode !== 'writing' || !sceneId) return [];
    return readableScene(store.assistantView().manuscript(), sceneId)
      ? [sceneId]
      : [];
  }

  /** The Plan `planId`, refusing any other Conversation. */
  async function readPlan(planId: string): Promise<Conversation> {
    const plan = await store.readConversation(planId);
    if (plan.mode !== 'plan') {
      throw new Error('Only a Plan Conversation brings in Brainstorms');
    }
    return plan;
  }

  /**
   * What the Author's message asking for a Review says. Refuses when there
   * is no Scene in focus that the Assistant can read, or for a Chapter
   * Review, when it is in no Chapter.
   */
  function reviewAsk(command: ReviewCommand, sceneId: string | null): string {
    const manuscript = store.assistantView().manuscript();
    if (!sceneId || !readableScene(manuscript, sceneId)) {
      throw new Error('There is no Scene in focus to review');
    }
    const text = reviewText(command, sceneId, manuscript);
    if (!text) throw new Error('The Scene in focus is in no Chapter');
    return text;
  }

  /**
   * What a Plan's message asks for besides its text: the start button that
   * sent it, if any; else for the first message of a Plan on a Book already
   * outlined, a Plan check, whatever it says (spec: Outline planner §1).
   */
  async function planAskOf(
    { mode, messages, book }: Pick<Conversation, 'mode' | 'messages' | 'book'>,
    asked: PlanAsk | undefined,
  ): Promise<PlanAsk | undefined> {
    if (mode !== 'plan' || asked) return asked;
    if (messages.some((m) => m.role === 'author')) return undefined;
    const view = store.assistantView();
    const planned = conversationBook(view.manuscript(), book);
    return (await isOutlined(view, planned)) ? 'check-plan' : undefined;
  }

  /**
   * Logs the Author's message, with the Scene in focus and the Review or
   * Plan start button it asks for, if any, and has the Assistant answer it.
   */
  async function ask(
    conversationId: string,
    message: { text: string; command?: ReviewCommand; ask?: PlanAsk },
    sceneId: string | null,
    onText: (text: string) => void,
  ): Promise<AskResult> {
    const conversation = await store.readConversation(conversationId);
    const { mode, messages: earlier } = conversation;
    if (message.command && mode !== 'writing') {
      throw new Error('Only a Writing Conversation has Reviews');
    }
    if (message.ask && mode !== 'plan') {
      throw new Error('Only a Plan Conversation has its start buttons');
    }
    const planAsk = await planAskOf(conversation, message.ask);
    const authored: ConversationMessage = {
      role: 'author',
      text: message.text,
      ...(message.command && { command: message.command }),
      ...(planAsk && { ask: planAsk }),
      focus: focusOf(conversation, sceneId),
      at: clock.now(),
    };
    await store.appendMessage(conversationId, authored);
    return answer(
      conversationId,
      conversation,
      [...earlier, authored],
      authored.focus,
      onText,
    );
  }

  /**
   * Asks the Conversation's Model to answer it as logged, which ends with
   * the Author's message, with the context the Conversation's Mode gives the
   * Scene in `focus`, or in an Interview, the focus it was last set to, and
   * in a Series, a Brainstorm or Interview about the Book it was last put on.
   * The reply is logged once it has come, without its thinking: as
   * interrupted if the call fails partway, or cut short at the length limit,
   * or as empty if nothing is left of it; a call that fails before any reply
   * logs nothing, unless it said what it used, which still counts. A
   * request past its Model's window isn't sent at all, in any Mode, and
   * fails with what it is made of, as one the Provider refuses as too long
   * does. Past the threshold for the Model's window, the older messages
   * are compacted first. Only a complete reply makes Proposals, and a
   * Review's reply holds Findings, never Proposals. So does a Plan check: a
   * Plan reply asked for one, or holding Findings. In Research, and only
   * there, the pages linked in the Author's message are read afresh and sent
   * with it; the reply names those that couldn't be read.
   */
  async function answer(
    conversationId: string,
    {
      mode,
      focus: interviewFocus,
      compactions,
      model,
      book,
    }: Pick<Conversation, 'mode' | 'focus' | 'compactions' | 'model' | 'book'>,
    messages: ConversationMessage[],
    focus: string[],
    onText: (text: string) => void,
  ): Promise<AskResult> {
    const chosen = model ?? defaultModel();
    const summary = await summaryToSend(
      conversationId,
      messages,
      compactions?.at(-1),
      chosen,
    );
    const pages =
      mode === 'research' && readPages
        ? await readPages(
            messages.findLast((m) => m.role === 'author')?.text ?? '',
          )
        : [];
    const asked = {
      ...defaultRequest(mode, focus[0] ?? null, messages, interviewFocus, book),
      ...(summary && { summary }),
      ...(mode === 'plan' && {
        broughtIn: await store.broughtInBrainstorms(conversationId),
      }),
      ...(pages.length > 0 && { pages }),
    };
    const view = store.assistantView();
    const context = await buildContext(view, asked);
    const window = measuredWindow(chosen);
    if (window && pastWindow(context.size.request, window)) {
      return {
        reply: null,
        failure: 'context',
        tooBig: againstWindow(context.size, window),
      };
    }
    const reviewing = asked.mode === 'writing' && asked.command !== 'question';
    const request: ProviderRequest = {
      model: chosen,
      system: context.system,
      messages: context.messages,
    };
    const finished = await finishedCall(providerFor(chosen), request, onText);
    const { metered } = finished;
    const failure = finished.failure?.kind ?? null;
    const tooBig =
      failure === 'context'
        ? { tooBig: againstWindow(context.size, window) }
        : {};
    if (finished.kind === 'nothing') return { reply: null, failure, ...tooBig };
    if (finished.kind === 'empty') {
      const empty: EmptyReply = {
        focus,
        at: clock.now(),
        model: chosen.id,
        provider: chosen.provider,
        ...metered,
        reason: finished.reason,
        before: messages.length,
      };
      await store.appendEmptyReply(conversationId, empty, chosen);
      return { reply: null, empty, failure, ...tooBig };
    }
    const findings =
      mode === 'writing'
        ? await findingsIn(finished.findings, context.saw)
        : [];
    const planFindings =
      mode === 'plan'
        ? planFindingsIn(
            finished.findings,
            planUnitIds(view.manuscript(), context.book),
          )
        : [];
    const checking =
      planFindings.length > 0 ||
      messages.findLast((m) => m.role === 'author')?.ask === 'check-plan';
    // A Review or a Plan check asks before it proposes.
    const made =
      reviewing || checking
        ? null
        : await readProposals(
            view,
            finished.proposals,
            storyBibleOf(view, context.book),
            mode,
            {
              // An Add may go in or after a unit one still pending proposes.
              earlier: messages.flatMap((m) =>
                (m.proposals ?? []).filter((p) => p.state.kind === 'pending'),
              ),
              today: dayOf(clock.now()),
            },
          );
    const proposals = made?.proposals ?? [];
    // A Plan check's Proposals can't be taken, so they count as unreadable.
    const unreadable = made
      ? finished.unreadable + made.unreadable
      : checking
        ? finished.unreadable + finished.proposals.length
        : 0;
    const unreadLinks = readOrNot(pages).unread;
    const reply: ConversationMessage = {
      role: 'assistant',
      text: finished.text,
      focus,
      at: clock.now(),
      model: chosen.id,
      provider: chosen.provider,
      ...metered,
      ...(finished.ending !== 'complete' && { interrupted: true as const }),
      ...(finished.ending === 'cut-short' && { cutShort: true as const }),
      ...(unreadable > 0 && { unreadable }),
      ...(unreadLinks.length > 0 && { unreadLinks }),
      saw: context.saw,
      ...(findings.length > 0 && { findings }),
      ...(planFindings.length > 0 && { planFindings }),
    };
    await store.appendMessage(conversationId, reply);
    for (const proposal of proposals) {
      await store.appendProposal(conversationId, proposal);
    }
    return { reply, failure, ...tooBig };
  }

  /**
   * The summary that stands in for the older `messages` when the Assistant
   * is asked: the `latest` one, or once the messages since are past the
   * threshold, a new one, without its thinking, logged before it is used.
   * A summary that failed, came back empty or was cut short isn't used: the
   * messages since the latest are sent in full instead, and what its call
   * used and cost, if it said, is logged so it counts.
   */
  async function summaryToSend(
    conversationId: string,
    messages: ConversationMessage[],
    latest: Compaction | undefined,
    chosen: Model,
  ): Promise<Compaction | undefined> {
    const covers = compactionPoint(
      messages,
      latest,
      compaction ??
        compactionFor(measuredWindow(chosen)?.contextWindow ?? null),
    );
    if (covers === null) return latest;
    const finished = await finishedCall(
      providerFor(chosen),
      summaryRequest(chosen, messages, covers, latest),
    );
    const { metered, failure } = finished;
    const made = {
      at: clock.now(),
      model: chosen.id,
      provider: chosen.provider,
      ...metered,
    };
    if (
      finished.kind === 'reply' &&
      finished.ending === 'complete' &&
      finished.text !== ''
    ) {
      const summary: Compaction = { text: finished.text, covers, ...made };
      await store.appendSummary(conversationId, summary);
      return summary;
    }
    if (metered.usage || metered.cost !== undefined) {
      const reason: UnusedSummary['reason'] = failure
        ? 'failed'
        : finished.kind === 'reply' && finished.ending === 'cut-short'
          ? 'cut-short'
          : 'empty';
      await store.appendUnusedSummary(conversationId, { ...made, reason });
    }
    return latest;
  }

  /**
   * The Findings a reply's finding blocks make, in the order a Review lists
   * them, each with the Scene it quotes among those the Assistant saw: the
   * one it names if the quote is there, else the one the quote is in, else
   * the one it names, else the only one.
   */
  async function findingsIn(blocks: unknown[], saw: Saw): Promise<Finding[]> {
    const findings = blocks.flatMap((block) => findingOf(block) ?? []);
    if (findings.length === 0) return [];
    const view = store.assistantView();
    const prose = new Map<string, string>();
    for (const unit of saw.units) {
      if (unit.kind === 'scene') {
        prose.set(unit.id, unitText(await view.read(unit)));
      }
    }
    const only = prose.size === 1 ? [...prose.keys()][0] : undefined;
    return inOrder(
      findings.map(({ sceneId: named, ...finding }) => {
        const known = named && prose.has(named) ? named : undefined;
        const { quote } = finding;
        const quoting = quote
          ? [...prose.keys()].filter((id) => quotedIn(prose.get(id)!, quote))
          : [];
        const sceneId =
          (known && quoting.includes(known) ? known : quoting[0]) ??
          known ??
          only;
        return { ...finding, ...(sceneId && { sceneId }) };
      }),
    );
  }

  /**
   * The Plan `plan`'s request as it would be sent now on `model`, measured,
   * with the window it is measured against; null when that window is
   * unknown or unreliable, as nothing is measured then. A new Plan, not
   * started yet, on the Book `book`, is measured empty.
   */
  async function planSize(
    plan: Conversation | null,
    model: Model,
    book: string | undefined,
  ): Promise<(MeasuredSize & { window: KnownWindow }) | null> {
    const window = measuredWindow(model);
    if (!window) return null;
    const summary = plan?.compactions?.at(-1);
    const { size } = await buildContext(store.assistantView(), {
      ...defaultRequest('plan', null, plan?.messages ?? [], plan?.focus, book),
      ...(summary && { summary }),
      ...(plan && { broughtIn: await store.broughtInBrainstorms(plan.id) }),
    });
    return { ...size, window };
  }

  /**
   * The Findings of a Plan check a reply's finding blocks make, in the order
   * given, most consequential first, each naming only those of its units
   * that are among `units`, the Book's.
   */
  function planFindingsIn(
    blocks: unknown[],
    units: Set<string>,
  ): PlanFinding[] {
    return blocks.flatMap((block) => {
      const finding = planFindingOf(block);
      return finding
        ? [{ ...finding, units: finding.units.filter((id) => units.has(id)) }]
        : [];
    });
  }

  return {
    /**
     * Asks the Assistant in a Conversation: calls `onText` with each piece of
     * the reply as it streams, and resolves with how it went once the reply is
     * logged. The Assistant sees this Conversation only, never another.
     */
    async askAssistant(
      conversationId: string,
      message: string,
      focus: Focus,
      onText: (text: string) => void,
    ): Promise<AskResult> {
      // What the Author typed last is on disk before the context is built.
      await store.flush();
      return ask(conversationId, { text: message }, focus.sceneId, onText);
    },

    /**
     * Asks the Assistant in a Writing Conversation for a Review of the Scene
     * in `focus`, or of its Chapter, as `askAssistant` asks; the reply holds
     * the Review's Findings. Refuses when there is nothing to review.
     */
    async review(
      conversationId: string,
      command: ReviewCommand,
      focus: Focus,
      onText: (text: string) => void,
    ): Promise<AskResult> {
      await store.flush();
      const text = reviewAsk(command, focus.sceneId);
      return ask(conversationId, { text, command }, focus.sceneId, onText);
    },

    /**
     * Asks in a Plan Conversation what one of its start buttons asks, as
     * `askAssistant` asks: the Author's message is the button's label, and
     * its fixed request goes with it. Refused in another Mode.
     */
    async planAsk(
      conversationId: string,
      planAsk: PlanAsk,
      onText: (text: string) => void,
    ): Promise<AskResult> {
      await store.flush();
      const text = PLAN_ASK_LABELS[planAsk];
      return ask(conversationId, { text, ask: planAsk }, null, onText);
    },

    /**
     * The Brainstorms the Plan `planId` may bring in (spec: Outline planner
     * §6), or a new one, not started yet, on the Book `book`, Starred first,
     * then newest: each with its rough size, in tokens, as it would be sent
     * were it brought in now, and how far it is brought in already, if it
     * is; marked when bringing it in would push the Plan's request past its
     * Model's window: a new one's is `model`, as chosen before it starts.
     * Refused for a Conversation of another Mode.
     */
    async bringInChoices(
      planId: string | null,
      book?: string,
      model?: Model,
    ): Promise<BringInChoice[]> {
      const plan = planId ? await readPlan(planId) : null;
      const onBook = plan ? plan.book : book;
      const candidates = await store.bringInCandidates(onBook);
      const now = broughtInNow(plan?.bringIns);
      const measured = await planSize(
        plan,
        plan?.model ?? model ?? defaultModel(),
        onBook,
      );
      return candidates
        .map(({ starred, ...conversation }) => {
          const { id, title, created } = conversation;
          const upTo = conversation.messages.length;
          const broughtIn = now.find((b) => b.conversation === id)?.messages;
          const size = tokens(broughtInText({ conversation, upTo }));
          const tooBig =
            measured &&
            pastWindow(
              measured.request -
                (measured.broughtIn.find((b) => b.id === id)?.size ?? 0) +
                size,
              measured.window,
            );
          return {
            id,
            title,
            created,
            starred,
            messages: upTo,
            size,
            ...(broughtIn !== undefined && { broughtIn }),
            ...(tooBig && { tooBig: true as const }),
          };
        })
        .sort(
          (a, b) =>
            Number(b.starred) - Number(a.starred) || b.created - a.created,
        );
    },

    /**
     * Brings the Brainstorm `brainstormId` into the Plan `planId` as far as
     * it goes now, or the rest of it, logged with its rough size; refuses
     * one the Plan may not bring in.
     */
    async bringIn(planId: string, brainstormId: string): Promise<void> {
      const { book } = await readPlan(planId);
      const conversation = (await store.bringInCandidates(book)).find(
        (c) => c.id === brainstormId,
      );
      if (!conversation) {
        throw new Error('That Brainstorm can’t be brought into this Plan');
      }
      const upTo = conversation.messages.length;
      await store.bringIn(planId, {
        conversation: brainstormId,
        messages: upTo,
        size: tokens(broughtInText({ conversation, upTo })),
      });
    },

    /**
     * Asks again after a failed call: the Assistant answers the Author's last
     * message, about the Scene that was in focus when it was sent, in a new
     * turn. An interrupted reply stays in the log.
     */
    async retry(
      conversationId: string,
      onText: (text: string) => void,
    ): Promise<AskResult> {
      await store.flush();
      const conversation = await store.readConversation(conversationId);
      const last = conversation.messages.findLast((m) => !m.interrupted);
      if (last?.role !== 'author') {
        throw new Error('There is no message waiting for an answer');
      }
      return answer(
        conversationId,
        conversation,
        conversation.messages,
        focusOf(conversation, last.focus[0] ?? null),
        onText,
      );
    },
  };
}
