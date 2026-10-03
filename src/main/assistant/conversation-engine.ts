import { randomUUID } from 'node:crypto';
import type {
  AskResult,
  AssistantFailure,
  ConversationMessage,
  Mode,
} from '../../shared/conversation';
import type { ModelId } from '../../shared/models';
import {
  proposalOf,
  replyText,
  splitReply,
  type Proposal,
} from '../../shared/proposal';
import type { Usage } from '../../shared/usage';
import type { Clock } from '../project-store/clock';
import type { ProjectStore } from '../project-store/project-store';
import { buildContext, defaultRequest, readableScene } from './context-builder';
import { ProviderError, type Provider, type ProviderRequest } from './provider';

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
  >;
  provider: Provider;
  /** The model the next call uses, as chosen in Settings. */
  model: () => ModelId;
  clock: Clock;
};

/**
 * The Conversation engine: it turns the Author's message into a request,
 * streams the reply, and appends both to the Conversation's log, with the
 * Proposals the reply makes.
 */
export function createConversationEngine({
  store,
  provider,
  model,
  clock,
}: EngineDeps) {
  /**
   * The Scene in focus as a message logs it: in a Writing Conversation, the
   * Scene open, if the Assistant can read it.
   */
  function focusOf(mode: Mode, sceneId: string | null): string[] {
    if (mode !== 'writing' || !sceneId) return [];
    return readableScene(store.assistantView().manuscript(), sceneId)
      ? [sceneId]
      : [];
  }

  /**
   * Asks the model to answer the Conversation as logged, which ends with the
   * Author's message, with the context the Conversation's Mode gives the
   * Scene in `focus`. The reply is logged once it has come, or as
   * interrupted if the call fails partway; a call that fails before any
   * reply logs nothing.
   */
  async function answer(
    conversationId: string,
    mode: Mode,
    messages: ConversationMessage[],
    focus: string[],
    onText: (text: string) => void,
  ): Promise<AskResult> {
    const chosen = model();
    const context = await buildContext(
      store.assistantView(),
      defaultRequest(mode, focus[0] ?? null, messages),
    );
    const request: ProviderRequest = {
      model: chosen,
      system: context.system,
      messages: context.messages,
    };
    let text = '';
    let usage: Usage | undefined;
    let failure: AssistantFailure | null = null;
    try {
      for await (const event of provider.stream(request)) {
        if (event.type === 'usage') {
          usage = event.usage;
        } else {
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

    const reply: ConversationMessage = {
      role: 'assistant',
      text: replyText(text),
      focus,
      at: clock.now(),
      model: chosen,
      ...(usage && { usage }),
      ...(failure && { interrupted: true as const }),
      saw: context.saw,
    };
    await store.appendMessage(conversationId, reply);
    // A reply cut short isn't sent back to the model, so neither are its Proposals.
    for (const proposal of failure ? [] : await proposalsIn(text)) {
      await store.appendProposal(conversationId, proposal);
    }
    return { reply, failure };
  }

  /**
   * The Proposals a reply makes, each against its Entry as it is now. A
   * block that proposes nothing this app takes, such as a change to Prose or
   * to a Voice's example lines, is left out.
   */
  async function proposalsIn(reply: string): Promise<Proposal[]> {
    const view = store.assistantView();
    const proposals: Proposal[] = [];
    for (const block of splitReply(reply).blocks) {
      const entryId = (block as { entry?: unknown } | null)?.entry;
      const known = view.listEntries().some((e) => e.id === entryId);
      if (!known) continue;
      const entry = await view.read({ kind: 'entry', id: entryId as string });
      const change = proposalOf(block, entry);
      if (change) proposals.push({ id: randomUUID(), ...change });
    }
    return proposals;
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
      const { mode, messages: earlier } =
        await store.readConversation(conversationId);
      const authored: ConversationMessage = {
        role: 'author',
        text: message,
        focus: focusOf(mode, focus.sceneId),
        at: clock.now(),
      };
      await store.appendMessage(conversationId, authored);
      return answer(
        conversationId,
        mode,
        [...earlier, authored],
        authored.focus,
        onText,
      );
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
      const { mode, messages } = await store.readConversation(conversationId);
      const last = messages.findLast((m) => !m.interrupted);
      if (last?.role !== 'author') {
        throw new Error('There is no message waiting for an answer');
      }
      return answer(
        conversationId,
        mode,
        messages,
        focusOf(mode, last.focus[0] ?? null),
        onText,
      );
    },
  };
}
