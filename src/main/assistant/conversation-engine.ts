import {
  focusIds,
  OPEN_FOCUS,
  type AskResult,
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
  quotedIn,
  reviewText,
  type Finding,
  type ReviewCommand,
} from '../../shared/finding';
import type { Model } from '../../shared/models';
import { unitText } from '../../shared/project-types';
import type { Clock } from '../project-store/clock';
import type { ProjectStore } from '../project-store/project-store';
import {
  compactionPoint,
  DEFAULT_COMPACTION,
  summaryRequest,
  type CompactionPolicy,
} from './compaction';
import { buildContext, defaultRequest, readableScene } from './context-builder';
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
  >;
  /** The Provider each Model is reached through. */
  providerFor: ProviderFor;
  /** The Model asked in a Conversation that isn't on one yet. */
  defaultModel: () => Model;
  clock: Clock;
  /** When a long Conversation is compacted; tests make it short. */
  compaction?: CompactionPolicy;
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
  compaction = DEFAULT_COMPACTION,
}: EngineDeps) {
  /**
   * What a message is about, as it logs it: in a Writing Conversation, the
   * Scene open, if the Assistant can read it; in an Interview, the Entry,
   * Chapter or Scene in focus, if any.
   */
  function focusOf(
    { mode, focus }: Pick<Conversation, 'mode' | 'focus'>,
    sceneId: string | null,
  ): string[] {
    if (mode === 'interview') return focusIds(focus ?? OPEN_FOCUS);
    if (mode !== 'writing' || !sceneId) return [];
    return readableScene(store.assistantView().manuscript(), sceneId)
      ? [sceneId]
      : [];
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
   * Logs the Author's message, with the Scene in focus and the Review it
   * asks for, if any, and has the Assistant answer it.
   */
  async function ask(
    conversationId: string,
    message: { text: string; command?: ReviewCommand },
    sceneId: string | null,
    onText: (text: string) => void,
  ): Promise<AskResult> {
    const conversation = await store.readConversation(conversationId);
    const { mode, messages: earlier } = conversation;
    if (message.command && mode !== 'writing') {
      throw new Error('Only a Writing Conversation has Reviews');
    }
    const authored: ConversationMessage = {
      role: 'author',
      text: message.text,
      ...(message.command && { command: message.command }),
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
   * Scene in `focus`, or in an Interview, the focus it was last set to.
   * Past the threshold, the older messages are compacted first.
   * The reply is logged once it has come, without its thinking: as
   * interrupted if the call fails partway, or cut short at the length limit,
   * or as empty if nothing is left of it; a call that fails before any reply
   * logs nothing, unless it said what it used, which still counts. Only a
   * complete reply makes Proposals, and a Review's reply holds Findings,
   * never Proposals.
   */
  async function answer(
    conversationId: string,
    {
      mode,
      focus: interviewFocus,
      compactions,
      model,
    }: Pick<Conversation, 'mode' | 'focus' | 'compactions' | 'model'>,
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
    const asked = {
      ...defaultRequest(mode, focus[0] ?? null, messages, interviewFocus),
      ...(summary && { summary }),
    };
    const context = await buildContext(store.assistantView(), asked);
    const reviewing = asked.mode === 'writing' && asked.command !== 'question';
    const request: ProviderRequest = {
      model: chosen,
      system: context.system,
      messages: context.messages,
    };
    const finished = await finishedCall(providerFor(chosen), request, onText);
    const { metered } = finished;
    const failure = finished.failure?.kind ?? null;
    if (finished.kind === 'nothing') return { reply: null, failure };
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
      return { reply: null, empty, failure };
    }
    const findings =
      mode === 'writing'
        ? await findingsIn(finished.findings, context.saw)
        : [];
    // A Review asks before it proposes.
    const made = reviewing
      ? null
      : await readProposals(store.assistantView(), finished.proposals);
    const proposals = made?.proposals ?? [];
    const unreadable = made ? finished.unreadable + made.unreadable : 0;
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
      saw: context.saw,
      ...(findings.length > 0 && { findings }),
    };
    await store.appendMessage(conversationId, reply);
    for (const proposal of proposals) {
      await store.appendProposal(conversationId, proposal);
    }
    return { reply, failure };
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
    const covers = compactionPoint(messages, latest, compaction);
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
