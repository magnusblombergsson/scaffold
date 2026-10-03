import type { ConversationMessage } from '../../shared/conversation';
import type { ModelId } from '../../shared/models';
import type { ManuscriptScene } from '../../shared/project-types';
import type { Clock } from '../project-store/clock';
import type { ProjectStore } from '../project-store/project-store';
import type { Provider, ProviderRequest } from './provider';
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

  return {
    /**
     * Asks the Assistant in a Conversation: calls `onText` with each piece of
     * the reply as it streams, and resolves with the whole reply once it is
     * logged. The Assistant sees this Conversation only, never another.
     */
    async askAssistant(
      conversationId: string,
      message: string,
      focus: Focus,
      onText: (text: string) => void,
    ): Promise<ConversationMessage> {
      // What the Author typed last is on disk before the context is built.
      await store.flush();
      const earlier = (await store.readConversation(conversationId)).messages;
      const scene = await sceneBlock(focus.sceneId);
      const focusIds = scene && focus.sceneId ? [focus.sceneId] : [];
      await store.appendMessage(conversationId, {
        role: 'author',
        text: message,
        focus: focusIds,
        at: clock.now(),
      });

      const request: ProviderRequest = {
        model: model(),
        system: scene ? [WRITING_PROMPT, scene] : [WRITING_PROMPT],
        messages: [
          ...earlier.map((m) => ({
            role:
              m.role === 'author' ? ('user' as const) : ('assistant' as const),
            content: m.text,
          })),
          { role: 'user', content: message },
        ],
      };
      let text = '';
      for await (const event of provider.stream(request)) {
        text += event.text;
        onText(event.text);
      }

      const reply: ConversationMessage = {
        role: 'assistant',
        text,
        focus: focusIds,
        at: clock.now(),
      };
      await store.appendMessage(conversationId, reply);
      return reply;
    },
  };
}
