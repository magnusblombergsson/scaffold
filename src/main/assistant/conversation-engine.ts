import type {
  AskResult,
  AssistantFailure,
  ConversationMessage,
} from '../../shared/conversation';
import type { ModelId } from '../../shared/models';
import type { ManuscriptScene } from '../../shared/project-types';
import type { Usage } from '../../shared/usage';
import type { Clock } from '../project-store/clock';
import type { ProjectStore } from '../project-store/project-store';
import { ProviderError, type Provider, type ProviderRequest } from './provider';
import { sceneInFocus, WRITING_PROMPT } from './system-prompts';

/** What a message is about: the Scene open in the editor when it was sent, if any. */
export type Focus = { sceneId: string | null };

export type EngineDeps = {
  store: Pick<
    ProjectStore,
    'flush' | 'read' | 'manuscript' | 'readConversation' | 'appendMessage'
  >;
  provider: Provider;
  /** The model the next call uses, as chosen in Settings. */
  model: () => ModelId;
  clock: Clock;
};

/**
 * The Conversation engine: it turns the Author's message into a request,
 * streams the reply, and appends both to the Conversation's log.
 */
export function createConversationEngine({
  store,
  provider,
  model,
  clock,
}: EngineDeps) {
  /** The Scene in focus, if it is one the Assistant can read. */
  async function sceneBlock(sceneId: string | null): Promise<string | null> {
    if (!sceneId) return null;
    const { chapters, unplaced } = store.manuscript();
    const scenes: ManuscriptScene[] = [
      ...chapters.flatMap((c) => c.scenes),
      ...unplaced,
    ];
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || scene.missing) return null;
    const { markdown } = await store.read({ kind: 'scene', id: sceneId });
    return sceneInFocus(scene.title, markdown);
  }

  /**
   * Asks the model to answer the Conversation as logged, which ends with the
   * Author's message, about the Scene `scene` describes. The reply is logged
   * once it has come, or as interrupted if the call fails partway; a call that
   * fails before any reply logs nothing.
   */
  async function answer(
    conversationId: string,
    messages: ConversationMessage[],
    scene: string | null,
    focus: string[],
    onText: (text: string) => void,
  ): Promise<AskResult> {
    const chosen = model();
    const request: ProviderRequest = {
      model: chosen,
      system: scene ? [WRITING_PROMPT, scene] : [WRITING_PROMPT],
      // A reply cut short isn't sent back: the model would take it as one to
      // continue, and a Retry answers the Author's message afresh.
      messages: messages
        .filter((m) => !m.interrupted)
        .map((m) => ({
          role: m.role === 'author' ? 'user' : 'assistant',
          content: m.text,
        })),
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
      text,
      focus,
      at: clock.now(),
      model: chosen,
      ...(usage && { usage }),
      ...(failure && { interrupted: true as const }),
    };
    await store.appendMessage(conversationId, reply);
    return { reply, failure };
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
      const earlier = (await store.readConversation(conversationId)).messages;
      const scene = await sceneBlock(focus.sceneId);
      const focusIds = scene && focus.sceneId ? [focus.sceneId] : [];
      const authored: ConversationMessage = {
        role: 'author',
        text: message,
        focus: focusIds,
        at: clock.now(),
      };
      await store.appendMessage(conversationId, authored);
      return answer(
        conversationId,
        [...earlier, authored],
        scene,
        focusIds,
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
      const { messages } = await store.readConversation(conversationId);
      const last = messages.findLast((m) => !m.interrupted);
      if (last?.role !== 'author') {
        throw new Error('There is no message waiting for an answer');
      }
      const scene = await sceneBlock(last.focus[0] ?? null);
      return answer(
        conversationId,
        messages,
        scene,
        scene ? last.focus : [],
        onText,
      );
    },
  };
}
