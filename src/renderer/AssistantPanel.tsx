import { useContext, useState } from 'react';
import { MODE_LABELS, type Mode } from '../shared/conversation';
import { reviewText, type ReviewCommand } from '../shared/finding';
import { anyAdded, NoProviderState, useProviders } from './Providers';
import {
  Composer,
  ConversationUsage,
  conversationActions,
  MessageLog,
  useConversation,
  WINDOW_MODES,
  type Names,
  type OnChange,
  type ShowProposal,
} from './Conversation';
import { Menu, TitleInput } from './Binder';
import { ModelPicker } from './ModelPicker';
import { ReadOnlyContext } from './read-only';

/**
 * The Assistant beside the editor. Without an API key it only asks for one;
 * everything else in the window works without.
 */
export function AssistantPanel({
  active,
  width,
  onAddProvider,
  sceneId,
  names,
  show,
  onQuote,
  onChange,
}: {
  /** Whether the panel is shown, its Mode the window's. */
  active: boolean;
  /** In CSS pixels. */
  width: number;
  onAddProvider(): void;
  /** The Scene open in the editor, which a message sent now is about. */
  sceneId: string | null;
  names: Names;
  show: ShowProposal | null;
  /** Opens a Scene with a Finding's quote of its Prose selected. */
  onQuote(sceneId: string, quote: string): void;
  onChange: OnChange;
}) {
  const providers = useProviders();
  return (
    <aside className="assistant-panel" aria-label="Assistant" style={{ width }}>
      <h2 className="assistant-heading">Assistant</h2>
      {providers &&
        (anyAdded(providers) ? (
          <Conversations
            active={active}
            sceneId={sceneId}
            names={names}
            show={show}
            onOpenSettings={onAddProvider}
            onQuote={onQuote}
            onChange={onChange}
          />
        ) : (
          <NoProviderState onAddProvider={onAddProvider} />
        ))}
    </aside>
  );
}

/**
 * The Conversations of a Mode, as the selector chooses: a picker to resume
 * one, its messages, and for Writing, where the Author writes the next, or
 * asks for a Review of the Scene open or of its Chapter. A new Writing
 * Conversation starts when its first message is sent. A Conversation of
 * another Mode is read-and-decide only here: its Proposals can be decided,
 * but its messages are sent from that Mode's room.
 */
function Conversations({
  active,
  sceneId,
  names,
  show,
  onOpenSettings,
  onQuote,
  onChange,
}: {
  active: boolean;
  sceneId: string | null;
  names: Names;
  show: ShowProposal | null;
  onOpenSettings(): void;
  onQuote(sceneId: string, quote: string): void;
  onChange: OnChange;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const conversation = useConversation({
    mode: 'writing',
    sceneId,
    names,
    active,
    show,
    onChange,
  });
  const { list, current, error, streaming, total, resume, review, rename } =
    conversation;
  /** Whether the open Conversation's title is being edited. */
  const [renaming, setRenaming] = useState(false);
  /** The Mode chosen in the selector, while no Conversation is open. */
  const [chosen, setChosen] = useState<Mode>('writing');
  const mode = current?.mode ?? chosen;
  const listed = list.filter((c) => c.mode === mode);

  function choose(next: Mode) {
    setChosen(next);
    void resume('');
  }

  /** Whether there is something open to review: a Scene, or its Chapter. */
  function canReview(command: ReviewCommand): boolean {
    return !!sceneId && !!reviewText(command, sceneId, names.manuscript);
  }

  return (
    <div className="conversations">
      <div className="conversation-picker">
        <select
          aria-label="Mode"
          value={mode}
          onChange={(event) => choose(event.target.value as Mode)}
          disabled={streaming !== null}
        >
          {WINDOW_MODES.map((value) => (
            <option key={value} value={value}>
              {MODE_LABELS[value]}
            </option>
          ))}
        </select>
        <div className="conversation-choice">
          {renaming && current ? (
            <TitleInput
              title={current.title}
              onDone={(title) => {
                setRenaming(false);
                if (title) void rename(current.id, title);
              }}
            />
          ) : (
            <select
              aria-label="Conversation"
              value={current?.id ?? ''}
              onChange={(event) => void resume(event.target.value)}
              disabled={streaming !== null}
            >
              {mode === 'writing' ? (
                <option value="">New Conversation</option>
              ) : (
                <option value="" disabled>
                  Choose a Conversation
                </option>
              )}
              {listed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
          {current && (
            <Menu
              label={`Conversation actions: ${current.title}`}
              items={conversationActions(
                conversation,
                current.id,
                () => setRenaming(true),
                readOnly,
              )}
            />
          )}
        </div>
        <ModelPicker conversation={conversation} />
        <ConversationUsage total={total} />
      </div>
      <MessageLog
        conversation={conversation}
        names={names}
        empty={
          listed.length > 0
            ? undefined
            : `No ${mode === 'writing' ? '' : `${MODE_LABELS[mode]} `}Conversations yet.`
        }
        onOpenSettings={onOpenSettings}
        onQuote={onQuote}
      />
      {error && (
        <p className="assistant-error" role="alert">
          {error}
        </p>
      )}
      {mode === 'writing' ? (
        <>
          <div className="review-actions">
            <button
              className="primary"
              onClick={() => void review('review-scene')}
              disabled={
                readOnly || streaming !== null || !canReview('review-scene')
              }
            >
              Review Scene
            </button>
            <button
              className="primary"
              onClick={() => void review('review-chapter')}
              disabled={
                readOnly || streaming !== null || !canReview('review-chapter')
              }
            >
              Review Chapter
            </button>
          </div>
          <Composer
            conversation={conversation}
            placeholder={
              sceneId
                ? 'Ask about this Scene… Type @ to bring in another.'
                : 'Ask the Assistant… Type @ to bring in a Scene or Chapter.'
            }
            manuscript={names.manuscript}
          />
        </>
      ) : (
        <p className="read-and-decide">
          Decide its Proposals here; send messages to a {MODE_LABELS[mode]}{' '}
          Conversation from the {MODE_LABELS[mode]} room.
        </p>
      )}
    </div>
  );
}
