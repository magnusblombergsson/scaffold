import { randomUUID } from 'node:crypto';
import {
  focusIds,
  OPEN_FOCUS,
  type AskResult,
  type AssistantFailure,
  type Compaction,
  type Conversation,
  type ConversationMessage,
  type Saw,
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
import { PROJECT_OUTLINE, unitText } from '../../shared/project-types';
import {
  newEntryOf,
  outlineChangeOf,
  proposalOf,
  replyText,
  splitReply,
  type Proposal,
  type ProposalChange,
} from '../../shared/proposal';
import type { Usage } from '../../shared/usage';
import type { Clock } from '../project-store/clock';
import type { ProjectStore } from '../project-store/project-store';
import {
  compactionPoint,
  DEFAULT_COMPACTION,
  summaryRequest,
  type CompactionPolicy,
} from './compaction';
import { buildContext, defaultRequest, readableScene } from './context-builder';
import { ProviderError, type ProviderRequest } from './provider';
import type { ProviderFor } from './providers';

/** What a message is about: the Scene open in the editor when it was sent, if any. */
export type Focus = { sceneId: string | null };

export type EngineDeps = {
  store: Pick<
    ProjectStore,
    | 'flush'
    | 'assistantView'
    | 'readConversation'
    | 'appendMessage'
    | 'appendProposal'
    | 'appendSummary'
  >;
  /** The Provider each Model is reached through. */
  providerFor: ProviderFor;
  /** The Model the next call uses, as chosen in Settings. */
  model: () => Model;
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
  model,
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
   * Asks the model to answer the Conversation as logged, which ends with the
   * Author's message, with the context the Conversation's Mode gives the
   * Scene in `focus`, or in an Interview, the focus it was last set to.
   * Past the threshold, the older messages are compacted first.
   * The reply is logged once it has come, or as interrupted if the call fails partway; a call that fails before any
   * reply logs nothing. A Review's reply holds Findings, never Proposals.
   */
  async function answer(
    conversationId: string,
    {
      mode,
      focus: interviewFocus,
      compactions,
    }: Pick<Conversation, 'mode' | 'focus' | 'compactions'>,
    messages: ConversationMessage[],
    focus: string[],
    onText: (text: string) => void,
  ): Promise<AskResult> {
    const chosen = model();
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
    let text = '';
    let usage: Usage | undefined;
    let failure: AssistantFailure | null = null;
    try {
      for await (const event of providerFor(chosen).stream(request)) {
        if (event.type === 'usage') {
          usage = event.usage;
        } else if (event.type === 'text') {
          text += event.text;
          onText(event.text);
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        failure = error.kind;
      } else {
        console.error('The Assistant call failed:', error);
        failure = 'other';
      }
      if (text === '') return { reply: null, failure };
    }

    const findings =
      mode === 'writing' ? await findingsIn(text, context.saw) : [];
    const reply: ConversationMessage = {
      role: 'assistant',
      text: replyText(text),
      focus,
      at: clock.now(),
      model: chosen.id,
      ...(usage && { usage }),
      ...(failure && { interrupted: true as const }),
      saw: context.saw,
      ...(findings.length > 0 && { findings }),
    };
    await store.appendMessage(conversationId, reply);
    // A reply cut short isn't sent back to the model, so neither are its
    // Proposals; a Review asks before it proposes.
    const proposing = !failure && !reviewing;
    for (const proposal of proposing ? await proposalsIn(text) : []) {
      await store.appendProposal(conversationId, proposal);
    }
    return { reply, failure };
  }

  /**
   * The summary that stands in for the older `messages` when the Assistant
   * is asked: the `latest` one, or once the messages since are past the
   * threshold, a new one, logged before it is used. If the summary call
   * fails, the messages since the latest are sent in full instead.
   */
  async function summaryToSend(
    conversationId: string,
    messages: ConversationMessage[],
    latest: Compaction | undefined,
    chosen: Model,
  ): Promise<Compaction | undefined> {
    const covers = compactionPoint(messages, latest, compaction);
    if (covers === null) return latest;
    let text = '';
    let usage: Usage | undefined;
    try {
      const request = summaryRequest(chosen, messages, covers, latest);
      for await (const event of providerFor(chosen).stream(request)) {
        if (event.type === 'usage') usage = event.usage;
        else if (event.type === 'text') text += event.text;
      }
    } catch (error) {
      console.error('Compacting the Conversation failed:', error);
      return latest;
    }
    if (text.trim() === '') return latest;
    const summary: Compaction = {
      text: text.trim(),
      covers,
      at: clock.now(),
      model: chosen.id,
      ...(usage && { usage }),
    };
    await store.appendSummary(conversationId, summary);
    return summary;
  }

  /**
   * The Findings a reply makes, in the order a Review lists them, each with
   * the Scene it quotes among those the Assistant saw: the one it names if
   * the quote is there, else the one the quote is in, else the one it
   * names, else the only one.
   */
  async function findingsIn(reply: string, saw: Saw): Promise<Finding[]> {
    const findings = splitReply(reply).findings.flatMap(
      (block) => findingOf(block) ?? [],
    );
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
   * The Proposals a reply makes, each against its target as it is now. A
   * block that proposes nothing this app takes, such as a change to Prose,
   * Notes or a Voice's example lines, is left out.
   */
  async function proposalsIn(reply: string): Promise<Proposal[]> {
    const proposals: Proposal[] = [];
    for (const block of splitReply(reply).proposals) {
      const change = await changeOf(block);
      if (change) proposals.push({ id: randomUUID(), ...change });
    }
    return proposals;
  }

  /**
   * What a block proposes: a new Entry, under the id it will get; a whole
   * Outline of a Chapter or Scene in the Project, or of the story; or a change
   * to a field of an Entry in the Story Bible.
   */
  async function changeOf(block: unknown): Promise<ProposalChange | null> {
    const view = store.assistantView();
    const { entry: entryId, outline: outlineId } = (block ?? {}) as Record<
      string,
      unknown
    >;
    const proposed = newEntryOf(block);
    if (proposed) return { kind: 'new-entry', entryId: randomUUID(), proposed };
    if (typeof outlineId === 'string') {
      const { chapters, unplaced } = view.manuscript();
      const known =
        outlineId === PROJECT_OUTLINE ||
        [...chapters, ...chapters.flatMap((c) => c.scenes), ...unplaced].some(
          (unit) => unit.id === outlineId,
        );
      if (!known) return null;
      const outline = await view.read({ kind: 'outline', id: outlineId });
      return outlineChangeOf(block, outline);
    }
    if (!view.listEntries().some((e) => e.id === entryId)) return null;
    const entry = await view.read({ kind: 'entry', id: entryId as string });
    return proposalOf(block, entry);
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
